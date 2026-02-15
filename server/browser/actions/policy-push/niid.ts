import { Page } from "playwright";
import { config } from "../../../config";
import { getPage, touchSession } from "../../controller";
import { log, emitEvent } from "../../../utils/logger";

// ============================================
// SELECTORS — NIID Upload Policy page
// ============================================
const UPLOAD_SELECTORS = {
  // Select Class of Business
  businessClassDropDown: "#MainContent_drpPolicyType",
  // File upload
  fileInput: 'input[type="file"]',
  uploadButton: 'internal:role=button[name="Upload"i]',

  // Telerik file read progress area (appears after selecting a file)
  fileProgressArea: "#ctl00_MainContent_RadProgressArea1",
  fileProgressPercent: "#ctl00_MainContent_RadProgressArea1_Panel_PrimaryPercent",

  // Result panel (shows loading state, then upload results)
  resultPanel: "#MainContent_Panel5",
  resultMessage: "#MainContent_lblErrorMessage",

  // Loading indicator text inside Panel5
  loadingText: 'internal:text="Upload in progress, please wait"i',

  // Dashboard indicator (to confirm login)
  dashboardIndicator: 'internal:text="Upload Policy"i',
};

// ============================================
// Check NIID Push session
// ============================================

export async function checkNIIDPushSession(): Promise<boolean> {
  try {
    const page = await getPage("niid_push");
    await page.goto(config.niidPush.uploadUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const currentUrl = page.url();
    if (currentUrl.includes("/default.aspx")) {
      log("NIID Push session expired (redirected to login)", "warn");
      return false;
    }

    touchSession("niid_push");
    return true;
  } catch (err: any) {
    log(`NIID Push session check failed: ${err.message}`, "error");
    return false;
  }
}

// ============================================
// Get NIID Upload page (handles session check)
// ============================================

export async function getNIIDUploadPage(): Promise<Page> {
  const page = await getPage("niid_push");
  const currentUrl = page.url();

  // Detect expired session — NIID redirects to /default.aspx
  if (currentUrl.includes("/default.aspx")) {
    throw new Error(
      "NIID Push session expired. Please login again via the NIID Push login popup (CAPTCHA required).",
    );
  }

  if (currentUrl.includes("Upload_Policy.aspx")) {
    log("NIID Push already on Upload Policy page — skipping navigation");
    touchSession("niid_push");
    return page;
  }

  // Navigate to upload page
  await page.goto(config.niidPush.uploadUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Check if we got redirected to login
  const landedUrl = page.url();
  if (landedUrl.includes("/default.aspx")) {
    throw new Error(
      "NIID Push session expired. Please login again via the NIID Push login popup (CAPTCHA required).",
    );
  }

  touchSession("niid_push");
  return page;
}

// ============================================
// Upload result returned to the caller
// ============================================

export interface NiidUploadResult {
  resultText: string;
  hasResults: boolean;
}

// ============================================
// Upload policy file to NIID
// ============================================

export async function uploadPolicyFile(
  page: Page,
  filePath: string,
): Promise<NiidUploadResult> {
  log(`Uploading policy file to NIID: ${filePath}`);

  // Step 1: Select class of business — "Motor Vehicle"
  await page.selectOption(UPLOAD_SELECTORS.businessClassDropDown, "Motor Vehicle");
  log("Selected class of business: Motor Vehicle");

  // Step 2: Set the file on the file input
  await page.setInputFiles(UPLOAD_SELECTORS.fileInput, filePath);

  // Step 3: Wait for Telerik RadUploadProgressArea to finish reading the file
  // It appears after file selection and shows upload progress — we must wait
  // for it to reach 100% or disappear before clicking Upload.
  const progressArea = await page
    .waitForSelector(UPLOAD_SELECTORS.fileProgressArea, { timeout: 10000, state: "visible" })
    .catch(() => null);

  if (progressArea) {
    log("File progress area appeared, waiting for file read to complete...");
    const FILE_READ_TIMEOUT = 60_000; // 60 seconds max for file read
    const startTime = Date.now();

    while (Date.now() - startTime < FILE_READ_TIMEOUT) {
      // Check if the progress area has disappeared
      const stillVisible = await page
        .locator(UPLOAD_SELECTORS.fileProgressArea)
        .isVisible()
        .catch(() => false);

      if (!stillVisible) {
        log("File progress area disappeared — file read complete");
        break;
      }

      // Check if primary percent reached 100%
      const percentText = await page
        .locator(UPLOAD_SELECTORS.fileProgressPercent)
        .textContent()
        .catch(() => null);

      if (percentText?.trim() === "100") {
        log("File read reached 100%, waiting for progress area to close...");
        // Wait a moment for the progress area to auto-close
        await page
          .waitForSelector(UPLOAD_SELECTORS.fileProgressArea, { state: "hidden", timeout: 10000 })
          .catch(() => null);
        break;
      }

      await page.waitForTimeout(1000);
    }
  }

  // Step 4: Handle any JS alert dialog that may appear after clicking upload
  page.on("dialog", async (dialog) => {
    log(`NIID upload dialog: ${dialog.message()}`);
    await dialog.accept();
  });

  // Step 5: Click upload button
  await page.click(UPLOAD_SELECTORS.uploadButton);

  // Step 5: Wait for loading indicator to appear (upload started)
  const loadingEl = await page
    .waitForSelector(UPLOAD_SELECTORS.loadingText, { timeout: 30000 })
    .catch(() => null);

  if (loadingEl) {
    log("NIID upload in progress...");
    emitEvent("push:uploading", {
      message: "NIID upload in progress — waiting for NIID to process",
      elapsedSeconds: 0,
    });

    // Step 6: Poll while loading is visible, emitting periodic progress events
    // NIID can take a very long time — up to 5 minutes
    const MAX_UPLOAD_WAIT = 5 * 60 * 1000; // 5 minutes
    const POLL_INTERVAL = 10_000; // 10 seconds
    const startTime = Date.now();
    let elapsed = 0;

    while (elapsed < MAX_UPLOAD_WAIT) {
      await page.waitForTimeout(POLL_INTERVAL);
      elapsed = Date.now() - startTime;

      const stillLoading = await page
        .locator(UPLOAD_SELECTORS.loadingText)
        .isVisible()
        .catch(() => false);

      if (!stillLoading) {
        log(`NIID upload processing finished after ${Math.round(elapsed / 1000)}s`);
        break;
      }

      const elapsedSec = Math.round(elapsed / 1000);
      log(`NIID upload still in progress... (${elapsedSec}s elapsed)`);
      emitEvent("push:uploading", {
        message: `Still uploading on NIID — ${elapsedSec}s elapsed (this is normal, NIID can be slow)`,
        elapsedSeconds: elapsedSec,
      });
    }

    if (elapsed >= MAX_UPLOAD_WAIT) {
      throw new Error(
        "NIID upload timed out after 5 minutes. The upload may still be processing on NIID's side — please check manually.",
      );
    }
  }

  // Step 7: Read the result panel content
  const resultEl = await page
    .waitForSelector(UPLOAD_SELECTORS.resultMessage, { timeout: 15000 })
    .catch(() => null);

  if (!resultEl) {
    // Panel showed up empty — no result message at all
    return {
      resultText: "Upload completed but NIID returned no result. You may want to try again or check NIID manually.",
      hasResults: false,
    };
  }

  const resultText = (await resultEl.textContent())?.trim() ?? "";

  if (!resultText) {
    return {
      resultText: "Upload completed but NIID returned an empty result. You may want to try again or check NIID manually.",
      hasResults: false,
    };
  }

  log(`NIID upload result: ${resultText}`);
  return {
    resultText,
    hasResults: true,
  };
}

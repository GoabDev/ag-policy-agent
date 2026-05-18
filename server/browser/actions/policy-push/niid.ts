import { Page } from "playwright";
import { config } from "../../../config";
import { closeSessionRuntime, getPage, touchSession } from "../../controller";
import { log, emitEvent } from "../../../utils/logger";
import { SiteName } from "../../../types";
import { getNetworkTimeoutMs } from "../../timeoutSettings";
import { getFirstSheetName } from "../../../utils/xlsxProcessor";

// ============================================
// SELECTORS — NIID Upload Policy page
// ============================================
const UPLOAD_SELECTORS = {
  // Select Class of Business
  businessClassDropDown: "#MainContent_drpPolicyType",
  // File upload
  fileInput: 'input[type="file"]',
  uploadButton: 'internal:role=button[name="Upload"i]',
  uploadButtonCandidates: [
    "#MainContent_btnUpload",
    "#MainContent_btnUploadPolicy",
    'input[type="submit"][value="Upload"]',
    'input[type="button"][value="Upload"]',
    'button:has-text("Upload")',
  ],

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

async function clickUploadButton(page: Page) {
  for (const selector of UPLOAD_SELECTORS.uploadButtonCandidates) {
    const button = page.locator(selector).first();
    const isVisible = await button.isVisible().catch(() => false);
    if (!isVisible) continue;

    await button.click();
    log(`Clicked NIID upload button with selector: ${selector}`);
    return;
  }

  await page.click(UPLOAD_SELECTORS.uploadButton);
  log("Clicked NIID upload button by role");
}

// ============================================
// Check NIID Push session
// ============================================

export async function checkNIIDPushSession(
  site: Extract<SiteName, "niid_push" | "niid_auto_push"> = "niid_push",
): Promise<boolean> {
  try {
    const page = await getPage(site);
    await page.goto(config.niidPush.uploadUrl, {
      waitUntil: "domcontentloaded",
      timeout: getNetworkTimeoutMs(),
    });

    const currentUrl = page.url();
    if (currentUrl.includes("/default.aspx")) {
      log("NIID Push session expired (redirected to login)", "warn");
      return false;
    }

    touchSession(site);
    return true;
  } catch (err: any) {
    log(`NIID Push session check failed: ${err.message}`, "error");
    return false;
  }
}

// ============================================
// Get NIID Upload page (handles session check)
// ============================================

export async function getNIIDUploadPage(
  site: Extract<SiteName, "niid_push" | "niid_auto_push"> = "niid_push",
): Promise<Page> {
  let page = await getPage(site);
  const currentUrl = page.url();

  // Manual login can refresh storage while an old in-memory page remains on
  // the login URL. Drop that runtime context once before navigating.
  if (currentUrl.includes("/default.aspx")) {
    log("NIID Push page is on login URL, refreshing runtime context from saved session", "warn");
    await closeSessionRuntime(site);
    page = await getPage(site);
  }

  if (currentUrl.includes("Upload_Policy.aspx")) {
    log("NIID Push already on Upload Policy page — skipping navigation");
    touchSession(site);
    return page;
  }

  // Navigate to upload page
  await page.goto(config.niidPush.uploadUrl, {
    waitUntil: "domcontentloaded",
    timeout: getNetworkTimeoutMs(),
  });

  // Check if we got redirected to login
  const landedUrl = page.url();
  if (landedUrl.includes("/default.aspx")) {
    throw new Error(
      "NIID Push session expired. Please login again via the NIID Push login popup (CAPTCHA required).",
    );
  }

  touchSession(site);
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
  log(`NIID upload workbook first sheet: ${getFirstSheetName(filePath)}`);

  // Step 1: Select class of business — "Motor Vehicle"
  await page.selectOption(UPLOAD_SELECTORS.businessClassDropDown, "Motor Vehicle");
  log("Selected class of business: Motor Vehicle");

  // Step 2: Set the file on the file input
  await page.setInputFiles(UPLOAD_SELECTORS.fileInput, filePath);
  await page.locator(UPLOAD_SELECTORS.fileInput).evaluate((input) => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const selectedFileName = await page
    .locator(UPLOAD_SELECTORS.fileInput)
    .evaluate((input: HTMLInputElement) => input.value)
    .catch(() => "");

  if (!selectedFileName) {
    throw new Error("NIID did not accept the selected upload file");
  }

  log(`NIID file input selected: ${selectedFileName}`);

  // Step 3: Wait for Telerik RadUploadProgressArea to finish reading the file
  // It appears after file selection and shows upload progress — we must wait
  // for it to reach 100% or disappear before clicking Upload.
  const progressArea = await page
    .waitForSelector(UPLOAD_SELECTORS.fileProgressArea, { timeout: 5_000, state: "visible" })
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
          .waitForSelector(UPLOAD_SELECTORS.fileProgressArea, { state: "hidden", timeout: 5_000 })
          .catch(() => null);
        break;
      }

      await page.waitForTimeout(1000);
    }
  } else {
    log("File progress area did not appear; continuing to upload click");
  }

  // Step 4: Handle any JS alert dialog that may appear after clicking upload
  page.on("dialog", async (dialog) => {
    log(`NIID upload dialog: ${dialog.message()}`);
    await dialog.accept();
  });

  // Step 5: Click upload button
  await clickUploadButton(page);

  // Step 5: Wait for loading indicator to appear (upload started)
  const loadingEl = await page
    .waitForSelector(UPLOAD_SELECTORS.loadingText, { timeout: 30_000 })
    .catch(() => null);

  if (loadingEl) {
    log("NIID upload in progress...");
    emitEvent("push:uploading", {
      message: "NIID upload in progress — waiting for NIID to process",
      elapsedSeconds: 0,
    });

    // Step 6: Poll while loading is visible, emitting periodic progress events
    // NIID can take a very long time — up to 5 minutes
    const MAX_UPLOAD_WAIT = getNetworkTimeoutMs();
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
  } else {
    const resultText = await page
      .locator(UPLOAD_SELECTORS.resultMessage)
      .textContent({ timeout: 5_000 })
      .catch(() => "");

    if (!resultText?.trim()) {
      throw new Error(
        "NIID did not start the upload after clicking Upload. The file may not have been accepted by the page.",
      );
    }
  }

  // Step 7: Read the result panel content
  const resultEl = await page
    .waitForSelector(UPLOAD_SELECTORS.resultMessage, { timeout: getNetworkTimeoutMs() })
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

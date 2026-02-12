import { Page } from "playwright";
import { config } from "../../../config";
import { getPage, touchSession } from "../../controller";
import { log } from "../../../utils/logger";

// ============================================
// SELECTORS — NIID Upload Policy page
// ============================================
// These will need updating after inspecting the actual page.
const UPLOAD_SELECTORS = {
  // File upload
  fileInput: 'input[type="file"]',
  uploadButton: 'internal:role=button[name="Upload"i]',

  // Feedback
  successMessage: 'internal:text="uploaded successfully"i',
  errorMessage: 'internal:text="error"i',

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
      "NIID Push session expired. Please login again via the NIID Push login popup (CAPTCHA required)."
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
      "NIID Push session expired. Please login again via the NIID Push login popup (CAPTCHA required)."
    );
  }

  touchSession("niid_push");
  return page;
}

// ============================================
// Upload policy file to NIID
// ============================================

export async function uploadPolicyFile(
  page: Page,
  filePath: string
): Promise<void> {
  log(`Uploading policy file to NIID: ${filePath}`);

  // Set the file on the file input
  await page.setInputFiles(UPLOAD_SELECTORS.fileInput, filePath);

  // Click upload button
  await page.click(UPLOAD_SELECTORS.uploadButton);

  // Handle potential JavaScript alert dialog
  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 30000 })
    .then(async (dialog) => {
      const message = dialog.message();
      log(`NIID upload dialog: ${message}`);
      await dialog.accept();
      return message;
    })
    .catch(() => null);

  // Also check for success message in the DOM
  const successElement = await page
    .waitForSelector(UPLOAD_SELECTORS.successMessage, { timeout: 30000 })
    .catch(() => null);

  const dialogMessage = await dialogPromise;

  if (successElement) {
    log("Policy file uploaded to NIID successfully");
    return;
  }

  if (dialogMessage && dialogMessage.toLowerCase().includes("success")) {
    log("Policy file uploaded to NIID successfully (via dialog)");
    return;
  }

  if (dialogMessage && dialogMessage.toLowerCase().includes("error")) {
    throw new Error(`NIID upload failed: ${dialogMessage}`);
  }

  // If we got here, check for error in the page
  const errorEl = await page
    .waitForSelector(UPLOAD_SELECTORS.errorMessage, { timeout: 5000 })
    .catch(() => null);

  if (errorEl) {
    const errorText = await errorEl.textContent();
    throw new Error(`NIID upload failed: ${errorText?.trim()}`);
  }

  log("NIID upload completed (no explicit success/error detected)", "warn");
}

import { Page, Download } from "playwright";
import fs from "fs";
import path from "path";
import { config } from "../../../config";
import { getPage, touchSession } from "../../controller";
import { loginToAG } from "../ag";
import { log } from "../../../utils/logger";

// ============================================
// SELECTORS — A&G Spool / Unpushed Policies page
// ============================================
// These will need updating after inspecting the actual page.
// Using best-guess selectors based on ASP.NET patterns from the site.
const SPOOL_SELECTORS = {
  // Search options
  searchOptionDropdown: 'internal:label="Select Search Option"i',
  policyNumberField: 'internal:role=textbox[name="Policy Number"i]',
  fromDateField: 'internal:role=textbox[name="From"i]',
  toDateField: 'internal:role=textbox[name="To"i]',
  searchButton: 'internal:role=button[name="Search"i]',
  downloadButton: 'internal:role=button[name="Download"i]',

  // Loading overlay (same as other AG pages)
  loadingOverlay: "#UpdateProgress2",

  // Results / feedback
  resultGrid: 'table[id*="GridView"]',
  noRecordsMessage: 'internal:text="No Record Found"i',

  // Confirmation dialog
  confirmationPanel: 'internal:role=dialog[name="A&G: Application Message"i]',
  closeButton: 'internal:role=button[name="Close"i]',
};

// Download directory
const DOWNLOADS_DIR = path.join(config.storagePath, "downloads");

function ensureDownloadsDir(): void {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

// ============================================
// Navigate to Spool Page
// ============================================

export async function navigateToSpoolPage(page: Page): Promise<void> {
  log("Navigating to A&G Spool Unpushed page...");
  await page.goto(config.ag.spoolUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  log("On A&G Spool Unpushed page");
}

// ============================================
// Get AG Spool page (handles session check)
// ============================================

export async function getAGSpoolPage(): Promise<Page> {
  const page = await getPage("ag");
  const currentUrl = page.url();

  // Detect expired session
  if (currentUrl.includes("ErrorPage.aspx")) {
    log("A&G session expired (on error page), re-logging in...", "warn");
    const loggedInPage = await loginToAG();
    await navigateToSpoolPage(loggedInPage);
    return loggedInPage;
  }

  if (currentUrl.includes("Spool_Unpushed.aspx")) {
    log("A&G already on Spool Unpushed page — skipping navigation");
    touchSession("ag");
    return page;
  }

  // Navigate to spool page (session may still be valid, just on a different page)
  try {
    await navigateToSpoolPage(page);
    return page;
  } catch {
    // Fallback: full login + navigate
    log("A&G navigation failed, falling back to login + navigate...");
    const loggedInPage = await loginToAG();
    await navigateToSpoolPage(loggedInPage);
    return loggedInPage;
  }
}

// ============================================
// Download by Policy Number
// ============================================

export async function downloadByPolicyNumber(
  page: Page,
  policyNumber: string
): Promise<string> {
  log(`Downloading policy by number: ${policyNumber}`);

  // Select "Fetch by Policy No" option
  await page.selectOption(
    SPOOL_SELECTORS.searchOptionDropdown,
    "Fetch by Policy No"
  );

  // Fill policy number
  await page.fill(SPOOL_SELECTORS.policyNumberField, policyNumber);

  // Click search and wait for download
  return await triggerSearchAndDownload(page);
}

// ============================================
// Download by Date Range
// ============================================

export async function downloadByDateRange(
  page: Page,
  fromDate: string,
  toDate: string
): Promise<string> {
  log(`Downloading policies by date range: ${fromDate} to ${toDate}`);

  // Select date range option
  await page.selectOption(
    SPOOL_SELECTORS.searchOptionDropdown,
    "Fetch by Date Range"
  );

  // Fill date fields (format: DD-MMM-YYYY e.g. "01-Feb-2026")
  await page.fill(SPOOL_SELECTORS.fromDateField, fromDate);
  await page.fill(SPOOL_SELECTORS.toDateField, toDate);

  // Click search and wait for download
  return await triggerSearchAndDownload(page);
}

// ============================================
// Trigger search, then download the file
// ============================================

async function triggerSearchAndDownload(page: Page): Promise<string> {
  // Click search button
  await page.click(SPOOL_SELECTORS.searchButton);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "spoolSearch");

  // Check for "No Record Found" message
  const noRecords = await page
    .waitForSelector(SPOOL_SELECTORS.noRecordsMessage, { timeout: 3000 })
    .catch(() => null);

  if (noRecords) {
    throw new Error("No records found for the given search criteria");
  }

  // Check for error dialog
  const errorDialog = await page
    .waitForSelector(SPOOL_SELECTORS.confirmationPanel, { timeout: 3000 })
    .catch(() => null);

  if (errorDialog) {
    const errorText = await errorDialog.textContent().catch(() => "Unknown error");
    await page.click(SPOOL_SELECTORS.closeButton).catch(() => {});
    throw new Error(`A&G error: ${errorText?.trim()}`);
  }

  // Now click download and capture the file
  ensureDownloadsDir();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click(SPOOL_SELECTORS.downloadButton),
  ]);

  return await saveDownload(download);
}

// ============================================
// Save downloaded file to disk
// ============================================

async function saveDownload(download: Download): Promise<string> {
  const suggestedName = download.suggestedFilename();
  const timestamp = Date.now();
  const fileName = `${timestamp}_${suggestedName}`;
  const filePath = path.join(DOWNLOADS_DIR, fileName);

  await download.saveAs(filePath);
  log(`File downloaded: ${filePath}`);

  return filePath;
}

// ============================================
// Helper — wait for loading overlay to disappear
// ============================================

async function waitForOverlayToDisappear(
  page: Page,
  context: string
): Promise<void> {
  const start = Date.now();

  try {
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const style = (el as HTMLElement).style.display;
        if (style !== "none") {
          (el as any).__overlayAppeared = true;
        }
        return (el as any).__overlayAppeared && style === "none";
      },
      SPOOL_SELECTORS.loadingOverlay,
      { timeout: 30000, polling: 100 }
    );
  } catch {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(
      `Loading overlay did not disappear after ${elapsed}s during: ${context}`,
      "error"
    );
    throw new Error(
      `Loading overlay timed out after ${elapsed}s during: ${context}`
    );
  }
}

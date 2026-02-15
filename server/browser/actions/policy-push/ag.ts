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
  searchOptionDropdown: 'internal:label="Select Option"i',
  policyNumberField: 'internal:role=textbox[name="Policy No"i]',
  fromDateField: 'input[name="txtDate1"]',
  toDateField: 'internal:role=textbox[name="To"i]',
  // The spool button acts as both search and download trigger
  searchButton: 'internal:role=button[name="Spool"i]',

  // Results / feedback
  resultGrid: 'table[id*="GridView"]',
  noRecordsMessage: 'internal:text="No Record Found"i',

  // Error message (inline text on the page)
  errorMessage: 'internal:text="There is no record for the"i',
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
  const page = await getPage("ag_push");
  const currentUrl = page.url();

  // Detect expired session
  if (currentUrl.includes("ErrorPage.aspx")) {
    log("A&G session expired (on error page), re-logging in...", "warn");
    await loginToAG(); // loginToAG now sets up both ag and ag_push pages
    return await getPage("ag_push");
  }

  if (currentUrl.includes("Spool_Unpushed.aspx")) {
    log("A&G already on Spool Unpushed page — skipping navigation");
    touchSession("ag_push");
    return page;
  }

  // Navigate to spool page (session may still be valid, just on a different page)
  try {
    await navigateToSpoolPage(page);
    return page;
  } catch {
    // Fallback: full login + navigate
    log("A&G navigation failed, falling back to login + navigate...");
    await loginToAG();
    return await getPage("ag_push");
  }
}

// ============================================
// Download by Policy Number
// ============================================

export async function downloadByPolicyNumber(
  page: Page,
  policyNumber: string,
): Promise<string> {
  log(`Downloading policy by number: ${policyNumber}`);

  // Select "Fetch by Policy No" option
  await page.selectOption(
    SPOOL_SELECTORS.searchOptionDropdown,
    "Filter by PolicyNo",
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
  toDate: string,
): Promise<string> {
  log(`Downloading policies by date range: ${fromDate} to ${toDate}`);

  // Select date range option
  await page.selectOption(
    SPOOL_SELECTORS.searchOptionDropdown,
    "Filter by Date Range",
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
  ensureDownloadsDir();
  const browserContext = page.context();

  // Flow: click spool → loading happens → new tab opens → tab auto-closes →
  //       download arrives. We skip waiting for the overlay and instead race
  //       between an error appearing and the download completing.

  // Set up listeners before clicking so we don't miss events
  const downloadFromOriginal = page
    .waitForEvent("download", { timeout: 90000 })
    .catch(() => null);

  const popupPromise = browserContext
    .waitForEvent("page", { timeout: 90000 })
    .catch(() => null);

  // Click the spool button
  await page.click(SPOOL_SELECTORS.searchButton);

  // Race: either an error shows up quickly, or a popup opens for the download
  const errorPromise = checkForErrors(page, 5000);

  const outcome = await Promise.race([
    errorPromise.then(() => "no-error" as const),
    popupPromise.then((p) => ({ popup: p }) as { popup: Page | null }),
  ]);

  // If checkForErrors found an error it would have thrown, so we only
  // reach here if no error was found or a popup appeared first.

  if (typeof outcome === "object" && outcome.popup) {
    const popupPage = outcome.popup;
    log("New tab opened for download, waiting for it to close...");

    // Listen for download on the popup page too
    const downloadFromPopup = popupPage
      .waitForEvent("download", { timeout: 60000 })
      .catch(() => null);

    // Wait for popup to auto-close
    await popupPage.waitForEvent("close", { timeout: 60000 }).catch(() => {});
    log("Popup tab closed, waiting for download...");

    const download = (await downloadFromPopup) ?? (await downloadFromOriginal);
    if (download) {
      return await saveDownload(download);
    }
  } else {
    // No popup — download may have come directly on the original page
    const download = await downloadFromOriginal;
    if (download) {
      return await saveDownload(download);
    }
  }

  throw new Error("Download did not complete — no file was received");
}

// ============================================
// Check for inline errors on the page
// ============================================

async function checkForErrors(page: Page, timeout = 3000): Promise<boolean> {
  const noRecords = await page
    .waitForSelector(SPOOL_SELECTORS.noRecordsMessage, { timeout })
    .catch(() => null);

  if (noRecords) {
    throw new Error("No records found for the given search criteria");
  }

  const errorEl = await page
    .waitForSelector(SPOOL_SELECTORS.errorMessage, { timeout })
    .catch(() => null);

  if (errorEl) {
    const errorText = await errorEl.textContent().catch(() => "Unknown error");
    throw new Error(`A&G error: ${errorText?.trim()}`);
  }

  return false;
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

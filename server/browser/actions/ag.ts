import { Page } from "playwright";
import fs from "fs";
import path from "path";
import { config } from "../../config";
import { getPage, saveSession, touchSession } from "../controller";
import { log } from "../../utils/logger";
import { PolicyStatusResult, PolicyStatusSummaryRow } from "../../types";
import { getNetworkTimeoutMs, getQuickCheckTimeoutMs } from "../timeoutSettings";

// ============================================
// SELECTORS — Update these after mapping the real site
// ============================================
// TODO: Replace with real selectors from screenshots
const SELECTORS = {
  // Login page
  login: {
    usernameField: 'internal:role=textbox[name="Username"i]', // TODO: update
    passwordField: 'internal:role=textbox[name="Password"i]', // TODO: update
    submitButton: 'internal:role=button[name="Logon"i]', // TODO: update
    dashboardIndicator: 'internal:text="Dashboard"', // TODO: element visible after successful login
  },
  // Update Policy navigator
  navigator: {
    policyOperations: 'internal:role=link[name=" Policy Operations "i]',
    updatePolicy: 'internal:role=link[name="Update Policy"i]',
  },
  // Policy search
  search: {
    selector: 'internal:label="Select Serach Option"i', // (Serach) is  a typo from the A&G ite dev
    searchField: 'internal:role=textbox[name="Search Option"i]',
    searchButton: 'internal:role=button[name="Fetch"i]',
    resultRow: ".policy-result-row",
    resultPolicyLink: ".policy-result-row a",
  },

  loadingOverlay: "#UpdateProgress2", // toggles display: none (hidden) / flex (loading)

  confirmationPanel: {
    confirmationPanel: 'internal:role=dialog[name="A&G: Application Message"i]',
    confirmButton: 'internal:role=button[name="Yes"i]',
    cancelButton: 'internal:role=button[name="No"i]',
    closeButton: 'internal:role=button[name="Close"i]',
    errorMessage: 'internal:role=text[name="Sorry. The Policy Number you"i]',
  },

  // Policy detail / edit form
  policy: {
    firstNameField: 'internal:role=textbox[name="First Name"i]',
    lastNameField: 'internal:role=textbox[name="Last Name"i]',
    chassisNumberField: 'internal:role=textbox[name="Chasis No"i]',
    regNumberField: 'internal:role=textbox[name="Rgeistration No"i]', // (Rgeistration) is  a typo from the A&G ite dev
    vehicleMakeField: 'internal:label="Vehicle Make"i',
    vehicleModelField: 'internal:label="Vehicle Model"i',
    vehicleYearField: 'internal:label="Vehicle Year"i',
    vehicleColorField: 'internal:label="Vehicle Color"i',
    vehicleValueTypeField: 'internal:label="Vehicle Value Type"i',
    saveButton: 'internal:role=button[name="Save"i]',
    error: 'internal:text="Sorry. The Policy Number you"',
    successMessage: 'internal:text="Record successfully Updated."i',
  },
  statusPage: {
    policyNumberField: 'internal:role=textbox[name="Search by Policy No"i]',
    certificateField: 'internal:role=textbox[name="Search by Certificate No"i]',
    policySearchButton: "#btnPolicy",
    certificateSearchButton: "#btnCert",
    tables: "table",
    trackButton: 'internal:role=link[name="Track"i]',
  },
};

// ============================================
// Login to A&G (fully automated, no captcha)
// ============================================

export async function loginToAG(
  site: "ag" | "ag_auto_push" = "ag",
): Promise<Page> {
  const isAutomatedPush = site === "ag_auto_push";
  log(
    isAutomatedPush
      ? "Logging into A&G Automated Push session..."
      : "Logging into A&G Platform...",
  );
  const page = await getPage(site);

  await page.goto(`${config.ag.url}`, { waitUntil: "networkidle" });

  // Check if already logged in
  try {
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, {
      timeout: getQuickCheckTimeoutMs(),
    });
    log(
      isAutomatedPush
        ? "Already logged into A&G Automated Push"
        : "Already logged into A&G",
    );
    touchSession(site);
  } catch {
    // Not logged in, proceed with login
    await page.fill(SELECTORS.login.usernameField, config.ag.username);
    await page.fill(SELECTORS.login.passwordField, config.ag.password);
    await page.click(SELECTORS.login.submitButton);

    // Wait for dashboard to load
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, {
      timeout: getNetworkTimeoutMs(),
    });
  }

  if (isAutomatedPush) {
    try {
      await page.goto(config.ag.spoolUrl, {
        waitUntil: "domcontentloaded",
        timeout: getNetworkTimeoutMs(),
      });
      log("A&G Automated Push page navigated to spool page");
    } catch (err: any) {
      log(
        `Failed to navigate A&G Automated Push page to spool: ${err.message}`,
        "warn",
      );
    }
  } else {
    // Also set up the ag_push page in the same context (shared cookies)
    const agPushPage = await getPage("ag_push");
    try {
      await agPushPage.goto(config.ag.spoolUrl, {
        waitUntil: "domcontentloaded",
        timeout: getNetworkTimeoutMs(),
      });
      log("AG Push page navigated to spool page");
    } catch (err: any) {
      log(`Failed to navigate AG Push page to spool: ${err.message}`, "warn");
    }
  }

  await saveSession(site);
  log(
    isAutomatedPush
      ? "A&G Automated Push login successful"
      : "A&G login successful ✅",
  );

  return page;
}

// ============================================
// Navigate to correct policy
// ============================================

export async function navigateToPolicy(page: Page): Promise<void> {
  log(`Navigating to policy`);

  // Navigate to search or use search bar
  await page.click(SELECTORS.navigator.policyOperations);

  // Click into the policy
  await page.click(SELECTORS.navigator.updatePolicy);
}

export async function openAGPolicyStatusPage(page: Page): Promise<void> {
  await page.goto(config.ag.policyStatusUrl, {
    waitUntil: "domcontentloaded",
    timeout: getNetworkTimeoutMs(),
  });
  await page
    .waitForLoadState("networkidle", { timeout: getNetworkTimeoutMs() })
    .catch(() => undefined);
}

export async function searchAGPolicyStatus(
  page: Page,
  lookupValue: string,
  lookupType: "policy_number" | "certificate",
): Promise<void> {
  log(`Searching scratch-card policy status by ${lookupType}: ${lookupValue}`);

  const input =
    lookupType === "certificate"
      ? page.locator(SELECTORS.statusPage.certificateField).first()
      : page.locator(SELECTORS.statusPage.policyNumberField).first();
  const button =
    lookupType === "certificate"
      ? page.locator(SELECTORS.statusPage.certificateSearchButton).first()
      : page.locator(SELECTORS.statusPage.policySearchButton).first();

  await input.waitFor({ state: "visible", timeout: getNetworkTimeoutMs() });
  await input.fill("");
  await input.fill(lookupValue);
  await button.click();

  await page
    .waitForLoadState("networkidle", { timeout: getNetworkTimeoutMs() })
    .catch(() => undefined);
  await page
    .getByText("View Complete Details", { exact: false })
    .waitFor({ state: "visible", timeout: getNetworkTimeoutMs() })
    .catch(() => undefined);
}

export async function extractAGPolicyStatusSummary(
  page: Page,
  lookupValue: string,
  lookupType: "policy_number" | "certificate",
): Promise<PolicyStatusResult> {
  const summaryRows = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    const extractCells = (row: HTMLTableRowElement) =>
      Array.from(row.querySelectorAll("th,td")).map(
        (cell) => cell.textContent?.trim() || "",
      );

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;
      const headers = extractCells(rows[0]).map((value) => value.toLowerCase());
      const isSummary =
        headers.includes("status") &&
        headers.includes("policyno") &&
        headers.includes("insured");

      if (!isSummary) continue;

      return rows
        .slice(1)
        .map((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          if (cells.length < 6) return null;
          return {
            policyNo: cells[2]?.textContent?.trim() || "",
            regNo: cells[4]?.textContent?.trim() || "",
            coverDate: cells[5]?.textContent?.trim() || "",
            vehicleMake: "",
            vehicleModel: "",
            response: cells[1]?.textContent?.trim() || "",
            canReset: Boolean(
              cells[0]?.querySelector(
                "button, input[type='button'], input[type='submit'], a",
              ),
            ),
          };
        })
        .filter(Boolean) as PolicyStatusSummaryRow[];
    }

    return [] as PolicyStatusSummaryRow[];
  });

  return {
    lookupValue,
    lookupType,
    channel: "scratch_card",
    summaryRows,
    trailRows: [],
  };
}

export async function trackAGPolicyStatusDetails(
  page: Page,
  lookupValue: string,
): Promise<void> {
  log(`Tracking scratch-card status details for: ${lookupValue}`);
  const trackButton = page
    .getByRole("link", { name: "Track", exact: true })
    .first();
  await trackButton.waitFor({ state: "visible", timeout: getNetworkTimeoutMs() });
  await trackButton.click();
  await page
    .waitForLoadState("networkidle", { timeout: getNetworkTimeoutMs() })
    .catch(() => undefined);
  await page
    .getByText("Transaction Tracker", { exact: false })
    .waitFor({ state: "visible", timeout: getNetworkTimeoutMs() });
}

export async function extractAGPolicyStatusDetails(
  page: Page,
): Promise<Array<{ label: string; value: string }>> {
  return page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    const details: Array<{ label: string; value: string }> = [];

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;
      const headerCells = Array.from(rows[0].querySelectorAll("th")).map(
        (cell) => cell.textContent?.trim().toLowerCase() || "",
      );
      const isDetailTable =
        headerCells.includes("transaction record") &&
        headerCells.includes("data");
      if (!isDetailTable) continue;

      rows.slice(1).forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length < 2) return;
        details.push({
          label: cells[0]?.textContent?.trim() || "",
          value: cells[1]?.textContent?.trim() || "",
        });
      });
    }

    return details;
  });
}
// ============================================
// Search for a policy by number
// ============================================

export async function searchPolicy(
  page: Page,
  policyNumber: string,
): Promise<void> {
  log(`Refreshing browser and searching for policy: ${policyNumber}`);

  // Refresh to clear previous errors/states (as suggested to avoid unhandled states)
  await page.reload({ waitUntil: "networkidle" });

  // Navigate to selector and select fetch by policy number
  await page.selectOption(SELECTORS.search.selector, "Fetch by Policy No");

  // Navigate to search or use search bar
  await page.fill(SELECTORS.search.searchField, policyNumber);

  // CLick Fetch button
  await page.click(SELECTORS.search.searchButton);

  // await page.waitForTimeout(2000);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "searchPolicy");

  // Check if error dialog appeared (gives it a few seconds to render after overlay clears)
  const errorDialog = await page
    .waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
      timeout: getQuickCheckTimeoutMs(),
    })
    .catch(() => null);

  if (errorDialog) {
    const errorMsg = await page
      .textContent(SELECTORS.confirmationPanel.errorMessage)
      .catch(() => null);
    const message = errorMsg?.trim() || "Invalid policy number";
    log(`Error: ${message}`);
    // Close the error dialog
    await page.click(SELECTORS.confirmationPanel.closeButton);
    throw new Error(message);
  }

  log(`Policy ${policyNumber} loaded`);
}

// ============================================
// Correction Actions
// ============================================

export async function correctName(
  page: Page,
  newFirstName: string,
  newLastName: string,
): Promise<{ oldFirstName: string; oldLastName: string }> {
  // Read old values before overwriting
  const oldFirstName = await page.inputValue(SELECTORS.policy.firstNameField);
  const oldLastName = await page.inputValue(SELECTORS.policy.lastNameField);
  log(`Old name: ${oldFirstName} ${oldLastName}`);
  log(`Correcting name to: ${newFirstName} ${newLastName}`);

  await page.fill(SELECTORS.policy.firstNameField, ""); // Clear existing
  await page.fill(SELECTORS.policy.firstNameField, newFirstName);

  // If newLastName is empty string, check the current value in the field
  if (newLastName === "") {
    const existingLastName = await page.inputValue(
      SELECTORS.policy.lastNameField,
    );
    if (existingLastName.trim() === "") {
      // If it's also an empty string, set it to "."
      await page.fill(SELECTORS.policy.lastNameField, ".");
    }
    // else we ignore it (don't fill anything)
  } else {
    // Normal update
    await page.fill(SELECTORS.policy.lastNameField, ""); // Clear existing
    await page.fill(SELECTORS.policy.lastNameField, newLastName);
  }

  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "correctName");

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Name correction saved on A&G ✅");

  return { oldFirstName, oldLastName };
}

export async function correctRegistration(
  page: Page,
  newRegNumber: string,
): Promise<string> {
  // First, read the OLD registration number (needed for NIID lookup)
  const oldRegNumber = await page.inputValue(SELECTORS.policy.regNumberField);
  log(`Old registration number: ${oldRegNumber}`);

  // Update to new reg number
  log(`Correcting registration to: ${newRegNumber}`);
  await page.fill(SELECTORS.policy.regNumberField, "");
  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "correctRegistration");

  // Wait for success confirmation (This might appear as another confirmation panel)
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Registration correction saved on A&G ✅");

  return oldRegNumber; // Return old reg for NIID
}

export async function correctVehicleMake(
  page: Page,
  newMake: string,
  newModel: string,
): Promise<{ oldMake: string; oldModel: string }> {
  // Read old values before changing
  const oldMake = await page.$eval(
    SELECTORS.policy.vehicleMakeField,
    (el) => (el as HTMLSelectElement).value,
  );
  const oldModel = await page.$eval(
    SELECTORS.policy.vehicleModelField,
    (el) => (el as HTMLSelectElement).value,
  );
  log(`Old vehicle: ${oldMake} ${oldModel}`);
  log(`Correcting vehicle make to: ${newMake} and model to: ${newModel}`);

  // Vehicle Make and Model are <select> dropdowns, not text inputs
  await page.selectOption(SELECTORS.policy.vehicleMakeField, newMake);

  // Selecting a make triggers an ASP.NET postback to populate the model dropdown
  await waitForOverlayToDisappear(page, "correctVehicleMake:makePostback");

  await page.selectOption(SELECTORS.policy.vehicleModelField, newModel);

  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "correctVehicleMake");

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Vehicle make correction saved on A&G ✅");

  return { oldMake, oldModel };
}

export async function correctRegandChasis(
  page: Page,
  newRegNumber: string,
  newChassisNumber: string,
): Promise<{ oldRegNumber: string; oldChassisNumber: string }> {
  // Read OLD values before overwriting
  const oldRegNumber = await page.inputValue(SELECTORS.policy.regNumberField);
  const oldChassisNumber = await page.inputValue(
    SELECTORS.policy.chassisNumberField,
  );
  log(`Old registration number: ${oldRegNumber}`);
  log(`Old chassis number: ${oldChassisNumber}`);

  log(
    `Correcting registration to: ${newRegNumber} and chassis to: ${newChassisNumber}`,
  );

  await page.fill(SELECTORS.policy.regNumberField, "");
  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);

  await page.fill(SELECTORS.policy.chassisNumberField, "");
  await page.fill(SELECTORS.policy.chassisNumberField, newChassisNumber);

  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "correctRegandChasis");

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Registration and Chassis correction saved on A&G ✅");

  return { oldRegNumber, oldChassisNumber };
}

export async function correctChassis(
  page: Page,
  newChassisNumber: string,
): Promise<string> {
  // Read old chassis before overwriting
  const oldChassisNumber = await page.inputValue(
    SELECTORS.policy.chassisNumberField,
  );
  log(`Old chassis number: ${oldChassisNumber}`);
  log(`Correcting chassis to: ${newChassisNumber}`);

  await page.fill(SELECTORS.policy.chassisNumberField, "");
  await page.fill(SELECTORS.policy.chassisNumberField, newChassisNumber);

  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);

  // Wait for loading overlay to disappear
  await waitForOverlayToDisappear(page, "correctChassis");

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: getNetworkTimeoutMs(),
  });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Chassis correction saved on A&G ✅");

  return oldChassisNumber;
}

// ============================================
// Get A&G page already parked on Update Policy
// (skips login + navigation if keep-alive is active)
// ============================================

export async function getAGPolicyPage(): Promise<Page> {
  const page = await getPage("ag");
  const currentUrl = page.url();

  // Detect expired session — A&G redirects to ErrorPage.aspx
  if (currentUrl.includes("ErrorPage.aspx")) {
    log("A&G session expired (on error page), re-logging in...", "warn");
    const loggedInPage = await loginToAG();
    await navigateToPolicy(loggedInPage);
    return loggedInPage;
  }

  if (currentUrl.includes("Policy_Update.aspx")) {
    log("A&G already on Update Policy page — skipping login & navigation");
    touchSession("ag");
    return page;
  }

  // Fallback: session lost or page navigated away — do full login + navigate
  log("A&G not on Update Policy page, falling back to login + navigate...");
  const loggedInPage = await loginToAG();
  await navigateToPolicy(loggedInPage);
  return loggedInPage;
}

// ============================================
// Helper — wait for loading overlay to disappear
// ============================================

async function waitForOverlayToDisappear(
  page: Page,
  context: string,
): Promise<void> {
  const start = Date.now();

  // Wait for the overlay to appear and then disappear.
  // The ASP.NET UpdateProgress panel toggles style.display between "none" and "flex".
  // We track both transitions in one waitForFunction to avoid missing a fast overlay.
  try {
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        // Once the overlay has appeared (display !== "none") and then gone back to "none", we're done.
        // We store a flag on the element to track that it appeared at least once.
        const style = (el as HTMLElement).style.display;
        if (style !== "none") {
          (el as any).__overlayAppeared = true;
        }
        return (el as any).__overlayAppeared && style === "none";
      },
      SELECTORS.loadingOverlay,
      { timeout: getNetworkTimeoutMs(), polling: 100 },
    );
  } catch {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(
      `Loading overlay did not disappear after ${elapsed}s during: ${context}`,
      "error",
    );
    throw new Error(
      `Loading overlay timed out after ${elapsed}s during: ${context}`,
    );
  }
  const elapsed = Date.now() - start;
  if (elapsed > 10000) {
    log(
      `Loading overlay was slow (${(elapsed / 1000).toFixed(1)}s) during: ${context}`,
      "warn",
    );
  }
}

// ============================================
// Fetch Vehicle Makes & Models from the AG page
// ============================================

export interface VehicleData {
  makes: string[];
  models: Record<string, string[]>;
  fetchedAt: string;
}

const VEHICLE_DATA_PATH = path.join(config.storagePath, "vehicle-data.json");

function loadCachedVehicleData(): VehicleData | null {
  try {
    if (!fs.existsSync(VEHICLE_DATA_PATH)) return null;
    const raw = fs.readFileSync(VEHICLE_DATA_PATH, "utf-8");
    return JSON.parse(raw) as VehicleData;
  } catch {
    return null;
  }
}

function saveCachedVehicleData(data: VehicleData): void {
  const dir = path.dirname(VEHICLE_DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VEHICLE_DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

const POLICY_UPDATE_URL = process.env.AG_POLICY_UPDATE_URL;

/**
 * Read session cookie from the Playwright storage file.
 */
function getSessionCookie(): string {
  const sessionPath = config.ag.sessionPath;
  if (!fs.existsSync(sessionPath)) {
    throw new Error("No AG session found. Please login first.");
  }
  const storage = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  const cookies: { name: string; value: string }[] = storage.cookies || [];
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Parse all <option> values from a <select> by its ID in raw HTML.
 */
function parseSelectOptions(html: string, selectId: string): string[] {
  // Match the <select> block
  const selectRegex = new RegExp(
    `<select[^>]*id="${selectId}"[^>]*>([\\s\\S]*?)</select>`,
    "i",
  );
  const selectMatch = html.match(selectRegex);
  if (!selectMatch) return [];

  const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>/gi;
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = optionRegex.exec(selectMatch[1])) !== null) {
    const val = match[1];
    if (val && !val.toLowerCase().includes("select")) {
      values.push(val);
    }
  }
  return [...new Set(values)];
}

/**
 * Extract ASP.NET hidden fields (__VIEWSTATE, __EVENTVALIDATION, etc.) from HTML.
 */
function parseHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex =
    /<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    fields[match[1]] = match[2];
  }
  return fields;
}

// Track background model-fetching progress
let modelFetchStatus: {
  inProgress: boolean;
  processed: number;
  total: number;
} = { inProgress: false, processed: 0, total: 0 };

export function getModelFetchStatus() {
  return modelFetchStatus;
}

/**
 * Returns cached vehicle data if available.
 * If no cache or forceRefresh, fetches makes (fast) and kicks off background model fetch.
 */
export async function fetchVehicleData(
  forceRefresh = false,
): Promise<VehicleData> {
  const cached = loadCachedVehicleData();

  // If we have complete cached data and no refresh requested, return it
  if (!forceRefresh && cached && Object.keys(cached.models).length > 0) {
    log("Returning cached vehicle data from storage");
    return cached;
  }

  // If background fetch is already running, return whatever we have
  if (modelFetchStatus.inProgress) {
    if (cached) return cached;
    // Nothing cached yet but fetch is running — return empty structure
    return { makes: [], models: {}, fetchedAt: "" };
  }

  log("Fetching vehicle makes via HTTP...");

  const cookie = getSessionCookie();

  // GET the Policy Update page
  const initialRes = await fetch(POLICY_UPDATE_URL || "", {
    headers: { Cookie: cookie },
  });
  if (!initialRes.ok) {
    throw new Error(`Failed to fetch Policy Update page: ${initialRes.status}`);
  }
  const initialHtml = await initialRes.text();

  // Check if session is expired
  if (
    initialHtml.includes("ErrorPage") ||
    (initialHtml.includes("Login") && !initialHtml.includes("cboMakes"))
  ) {
    throw new Error(
      "AG session expired. Please login again before fetching vehicle data.",
    );
  }

  // Extract makes from the initial page (instant)
  const makes = parseSelectOptions(initialHtml, "cboMakes");
  log(`Found ${makes.length} vehicle makes`);

  if (makes.length === 0) {
    throw new Error(
      "No vehicle makes found on the page. Session may be invalid.",
    );
  }

  // Save makes immediately so frontend can use them
  const data: VehicleData = {
    makes,
    models: {},
    fetchedAt: new Date().toISOString(),
  };
  saveCachedVehicleData(data);

  // Kick off model fetching in background
  fetchModelsInBackground(makes, initialHtml, cookie);

  return data;
}

/**
 * Fetch models for all makes in the background (sequential due to ViewState).
 * Saves progress to cache periodically.
 */
async function fetchModelsInBackground(
  makes: string[],
  initialHtml: string,
  cookie: string,
): Promise<void> {
  modelFetchStatus = { inProgress: true, processed: 0, total: makes.length };
  log(`Starting background model fetch for ${makes.length} makes...`);

  const models: Record<string, string[]> = {};
  const hiddenFields = parseHiddenFields(initialHtml);

  for (let i = 0; i < makes.length; i++) {
    const make = makes[i];
    try {
      const formData = new URLSearchParams({
        ...hiddenFields,
        __EVENTTARGET: "cboMakes",
        __EVENTARGUMENT: "",
        cboMakes: make,
      });

      const postRes = await fetch(POLICY_UPDATE_URL || "", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!postRes.ok) {
        log(`POST for ${make} returned ${postRes.status}`, "warn");
        models[make] = [];
        continue;
      }

      const postHtml = await postRes.text();
      models[make] = parseSelectOptions(postHtml, "cboModel");

      // Update hidden fields for next request (ASP.NET rotates VIEWSTATE)
      const newFields = parseHiddenFields(postHtml);
      Object.assign(hiddenFields, newFields);

      modelFetchStatus.processed = i + 1;

      // Save progress every 25 makes
      if ((i + 1) % 25 === 0) {
        log(`Progress: ${i + 1}/${makes.length} makes processed`);
        const partialData: VehicleData = {
          makes,
          models,
          fetchedAt: new Date().toISOString(),
        };
        saveCachedVehicleData(partialData);
      }
    } catch (err: any) {
      log(`Failed to fetch models for ${make}: ${err.message}`, "warn");
      models[make] = [];
      modelFetchStatus.processed = i + 1;
    }
  }

  // Save final complete data
  const data: VehicleData = {
    makes,
    models,
    fetchedAt: new Date().toISOString(),
  };
  saveCachedVehicleData(data);

  modelFetchStatus = {
    inProgress: false,
    processed: makes.length,
    total: makes.length,
  };
  log(
    `Vehicle data complete: ${makes.length} makes, ${Object.values(models).reduce((s, m) => s + m.length, 0)} total models`,
  );
}

// Export selectors so they can be updated from config later
export { SELECTORS as AG_SELECTORS };

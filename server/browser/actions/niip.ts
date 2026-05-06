import { Page } from "playwright";
import { config } from "../../config";
import { getPage, saveSession, touchSession } from "../controller";
import { log } from "../../utils/logger";

const SELECTORS = {
  login: {
    usernameField: 'internal:role=textbox[name="Your Email"]',
    passwordField: 'internal:role=textbox[name="Your Password"]',
    submitButton: 'internal:role=button[name="Login"]',
    dashboardIndicator: 'internal:text="Welcome Admin"i',
  },
  search: {
    policyNumberField:
      'internal:role=textbox[name="Enter RegNo or Policy Number"]',
    // regNumberField: 'input[name*="Reg"]', we do not need a reg number to search for policies on niip
    searchButton: 'internal:role=button[name="Search"]',
  },
  policy: {
    emailField: 'internal:role=textbox[name="Policy Holder Email"]',
    nameField: 'internal:role=textbox[name="Policy Holder Name"i]',
    phoneField: 'internal:role=textbox[name="Policy Holder Phone Number"i]',
    addressField: 'internal:role=textbox[name="Policy Holder Address"i]',
    regNumberField: 'internal:role=textbox[name="Registration Number"i]',
    chassisNumberField: 'internal:role=textbox[name="Chassis Number"]',
    engineNumberField: 'internal:role=textbox[name="Engine Number"]',
    vehicleColor: "#drpColor",
    vehicleMake: "#drpVehicleMake",
    vehicleModel: "#drpVehicleModel",
    endorsePolicy: ".text-outline-success",
    saveButton: 'internal:role=button[name="Endorse"]',
    successMessage: 'internal:text="Policy holder record updated"i',
  },
};

export async function loginToNIIP(): Promise<Page> {
  log("Logging into NIIP...");
  const page = await getPage("niip");
  await page.goto(config.niip.url, { waitUntil: "networkidle" });

  try {
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, {
      timeout: 5000,
    });
    touchSession("niip");
  } catch {
    await page.fill(SELECTORS.login.usernameField, config.niip.username);
    await page.fill(SELECTORS.login.passwordField, config.niip.password);
    await page.click(SELECTORS.login.submitButton);
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, {
      timeout: 30000,
    });
  }

  await page.goto(config.niip.parkUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await saveSession("niip");
  log("NIIP login successful");
  return page;
}

export async function searchNIIPPolicy(
  page: Page,
  policyNumber: string,
  oldRegNumber: string,
): Promise<void> {
  log(`Searching NIIP for policy: ${policyNumber}, reg: ${oldRegNumber}`);
  const startUrl = page.url();

  await page.fill(SELECTORS.search.policyNumberField, policyNumber);
  await Promise.all([
    waitForNIIPSearchTransition(page, startUrl),
    page.click(SELECTORS.search.searchButton),
  ]);

  log(
    `NIIP search loaded for policy: ${policyNumber}, opening endorsement page`,
  );

  try {
    await Promise.all([
      waitForNIIPPageTransition(page),
      page.getByRole("cell", {
        name: "Endorse Policy",
        exact: true,
      }).click(),
    ]);
  } catch (err: any) {
    throw new Error(
      `Policy ${policyNumber} was not found on NIIP or the endorsement button could not be opened: ${err.message}`,
    );
  }

  log("NIIP endorsement page loaded");
}

export async function correctNIIPRegistration(
  page: Page,
  newRegNumber: string,
): Promise<void> {
  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
  await Promise.all([
    waitForNIIPPageTransition(page),
    page.click(SELECTORS.policy.saveButton),
  ]);
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await saveSession("niip");
}

export async function correctNIIPName(
  page: Page,
  firstName: string,
  lastName: string,
): Promise<string> {
  const fullName = `${firstName} ${lastName}`.trim();
  const oldName = await page.inputValue(SELECTORS.policy.nameField);

  log(`Old NIIP name: ${oldName}`);
  log(`Correcting NIIP name to: ${fullName}`);

  await page.fill(SELECTORS.policy.nameField, "");
  await page.fill(SELECTORS.policy.nameField, fullName);

  await Promise.all([
    waitForNIIPPageTransition(page),
    page.click(SELECTORS.policy.saveButton),
  ]);
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await saveSession("niip");

  log("Name correction saved on NIIP");
  return oldName;
}

export async function correctNIIPRegAndChassis(
  page: Page,
  newRegNumber: string,
  newChassisNumber: string,
): Promise<void> {
  const normalizedChassis = normalizeNIIPChassis(newChassisNumber);

  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
  await page.fill(SELECTORS.policy.chassisNumberField, normalizedChassis);
  await Promise.all([
    waitForNIIPPageTransition(page),
    page.click(SELECTORS.policy.saveButton),
  ]);
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await saveSession("niip");
}

export async function correctNIIPChassis(
  page: Page,
  newChassisNumber: string,
): Promise<void> {
  const normalizedChassis = normalizeNIIPChassis(newChassisNumber);

  await page.fill(SELECTORS.policy.chassisNumberField, normalizedChassis);
  await Promise.all([
    waitForNIIPPageTransition(page),
    page.click(SELECTORS.policy.saveButton),
  ]);
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await saveSession("niip");
}

export async function getNIIPPolicyPage(): Promise<Page> {
  const page = await getPage("niip");
  const currentUrl = page.url();

  if (currentUrl.toLowerCase().includes("/company/activepolicies")) {
    touchSession("niip");
    return page;
  }

  return loginToNIIP();
}

async function waitForNIIPSearchTransition(
  page: Page,
  startUrl: string,
): Promise<void> {
  try {
    await page.waitForURL((url) => url.toString() !== startUrl, {
      timeout: 15000,
    });
  } catch {
    await waitForNIIPPageTransition(page);
  }
}

async function waitForNIIPPageTransition(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await page
    .waitForLoadState("load", { timeout: 20000 })
    .catch(() => undefined);
}

function normalizeNIIPChassis(chassis: string): string {
  const cleaned = chassis.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (cleaned.length > 17) {
    throw new Error(
      `NIIP chassis must not exceed 17 alphanumeric characters after normalization. Received ${cleaned.length}.`,
    );
  }

  if (cleaned.length === 17) {
    return cleaned;
  }

  const normalized = `${cleaned}${"X".repeat(17 - cleaned.length)}`;
  log(
    `Normalized NIIP chassis from "${chassis}" to "${normalized}" to satisfy the 17-character requirement`,
    "warn",
  );
  return normalized;
}

export { SELECTORS as NIIP_SELECTORS };

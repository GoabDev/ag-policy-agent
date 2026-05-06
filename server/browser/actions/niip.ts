import { Page } from "playwright";
import { config } from "../../config";
import { getPage, saveSession, touchSession } from "../controller";
import { log } from "../../utils/logger";
import { SwapCorrectionInput } from "../../types";
import { normalizeVehicleColor } from "../../utils/vehicleOptions";

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
    regNumberField: 'internal:role=textbox[name="Registration Number"]',
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
    page.click(SELECTORS.search.searchButton, { noWaitAfter: true }),
  ]);

  log(
    `NIIP search loaded for policy: ${policyNumber}, opening endorsement page`,
  );

  try {
    await Promise.all([
      waitForNIIPPageTransition(page),
      page
        .getByRole("cell", {
          name: "Endorse Policy",
          exact: true,
        })
        .click(),
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
  await submitNIIPEndorse(page);
  await waitForNIIPSuccess(page);
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

  await submitNIIPEndorse(page);
  await waitForNIIPSuccess(page);
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
  await submitNIIPEndorse(page);
  await waitForNIIPSuccess(page);
  await saveSession("niip");
}

export async function correctNIIPChassis(
  page: Page,
  newChassisNumber: string,
): Promise<void> {
  const normalizedChassis = normalizeNIIPChassis(newChassisNumber);

  await page.fill(SELECTORS.policy.chassisNumberField, normalizedChassis);
  await submitNIIPEndorse(page);
  await waitForNIIPSuccess(page);
  await saveSession("niip");
}

export async function correctNIIPVehicleMakeModel(
  page: Page,
  newVehicleMake: string,
  newVehicleModel: string,
): Promise<{ oldMake: string; oldModel: string }> {
  const oldMake = await getSelectedOptionText(page, SELECTORS.policy.vehicleMake);
  const oldModel = await getSelectedOptionText(page, SELECTORS.policy.vehicleModel);

  const resolvedMake = await resolveNIIPOption(
    page,
    SELECTORS.policy.vehicleMake,
    newVehicleMake,
    "vehicle make",
  );

  await page.selectOption(SELECTORS.policy.vehicleMake, {
    label: resolvedMake,
  });
  await page.waitForTimeout(1000);

  const resolvedModel = await resolveNIIPOption(
    page,
    SELECTORS.policy.vehicleModel,
    newVehicleModel,
    "vehicle model",
  );

  await page.selectOption(SELECTORS.policy.vehicleModel, {
    label: resolvedModel,
  });

  await submitNIIPEndorse(page);
  await waitForNIIPSuccess(page);
  await saveSession("niip");

  log("Vehicle make/model correction saved on NIIP");
  return { oldMake, oldModel };
}

export async function applyNIIPSwap(
  page: Page,
  input: SwapCorrectionInput,
  resolvedName?: string,
): Promise<Record<string, string>> {
  const previousData: Record<string, string> = {};
  let hasChanges = false;

  if (resolvedName) {
    previousData.name = await page.inputValue(SELECTORS.policy.nameField);
    await page.fill(SELECTORS.policy.nameField, "");
    await page.fill(SELECTORS.policy.nameField, resolvedName);
    hasChanges = true;
  }

  if (input.email) {
    previousData.email = await page.inputValue(SELECTORS.policy.emailField);
    await page.fill(SELECTORS.policy.emailField, "");
    await page.fill(SELECTORS.policy.emailField, input.email);
    hasChanges = true;
  }

  if (input.phone) {
    previousData.phone = await page.inputValue(SELECTORS.policy.phoneField);
    await page.fill(SELECTORS.policy.phoneField, "");
    await page.fill(SELECTORS.policy.phoneField, input.phone);
    hasChanges = true;
  }

  if (input.engineNumber) {
    previousData.engineNumber = await page.inputValue(
      SELECTORS.policy.engineNumberField,
    );
    await page.fill(SELECTORS.policy.engineNumberField, "");
    await page.fill(SELECTORS.policy.engineNumberField, input.engineNumber);
    hasChanges = true;
  }

  if (input.newRegistrationNumber) {
    previousData.registrationNumber = await page.inputValue(
      SELECTORS.policy.regNumberField,
    );
    await page.fill(SELECTORS.policy.regNumberField, "");
    await page.fill(
      SELECTORS.policy.regNumberField,
      input.newRegistrationNumber,
    );
    hasChanges = true;
  }

  if (input.newChassisNumber) {
    previousData.chassisNumber = await page.inputValue(
      SELECTORS.policy.chassisNumberField,
    );
    await page.fill(SELECTORS.policy.chassisNumberField, "");
    await page.fill(
      SELECTORS.policy.chassisNumberField,
      normalizeNIIPChassis(input.newChassisNumber),
    );
    hasChanges = true;
  }

  if (input.vehicleColor) {
    const normalizedColor = normalizeVehicleColor(input.vehicleColor);
    previousData.vehicleColor = await getSelectedOptionText(
      page,
      SELECTORS.policy.vehicleColor,
    );
    await page.selectOption(SELECTORS.policy.vehicleColor, {
      label: normalizedColor,
    });
    hasChanges = true;
  }

  if (input.newVehicleMake && input.newVehicleModel) {
    previousData.vehicleMake = await getSelectedOptionText(
      page,
      SELECTORS.policy.vehicleMake,
    );
    previousData.vehicleModel = await getSelectedOptionText(
      page,
      SELECTORS.policy.vehicleModel,
    );
    const resolvedMake = await resolveNIIPOption(
      page,
      SELECTORS.policy.vehicleMake,
      input.newVehicleMake,
      "vehicle make",
    );
    await page.selectOption(SELECTORS.policy.vehicleMake, {
      label: resolvedMake,
    });
    await page.waitForTimeout(1000);
    const resolvedModel = await resolveNIIPOption(
      page,
      SELECTORS.policy.vehicleModel,
      input.newVehicleModel,
      "vehicle model",
    );
    await page.selectOption(SELECTORS.policy.vehicleModel, {
      label: resolvedModel,
    });
    hasChanges = true;
  }

  if (input.address) {
    previousData.address = await page.inputValue(SELECTORS.policy.addressField);
    await page.fill(SELECTORS.policy.addressField, "");
    await page.fill(SELECTORS.policy.addressField, input.address);
    hasChanges = true;
  }

  if (!hasChanges) {
    throw new Error("No NIIP swap fields were provided");
  }

  await submitNIIPEndorse(page);
  await waitForNIIPSuccess(page);
  await saveSession("niip");

  log("Swap correction saved on NIIP");
  return previousData;
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
      timeout: 45000,
    });
  } catch {
    await waitForNIIPPageTransition(page);
  }
}

async function waitForNIIPPageTransition(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
  await page
    .waitForLoadState("load", { timeout: 45000 })
    .catch(() => undefined);
}

async function submitNIIPEndorse(page: Page): Promise<void> {
  const startUrl = page.url();

  await page.click(SELECTORS.policy.saveButton, { noWaitAfter: true });

  try {
    await page.waitForURL((url) => url.toString() !== startUrl, {
      timeout: 45000,
    });
  } catch {
    await page.waitForLoadState("domcontentloaded", { timeout: 45000 });
    await page.waitForLoadState("load", { timeout: 45000 }).catch(
      () => undefined,
    );
  }
}

async function waitForNIIPSuccess(page: Page): Promise<void> {
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 45000,
  });
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

async function getSelectedOptionText(
  page: Page,
  selector: string,
): Promise<string> {
  return page.$eval(selector, (el) => {
    const select = el as HTMLSelectElement;
    return select.selectedOptions[0]?.text?.trim() || select.value || "";
  });
}

function normalizeVehicleToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function resolveNIIPOption(
  page: Page,
  selector: string,
  input: string,
  fieldLabel: string,
): Promise<string> {
  const normalizedInput = normalizeVehicleToken(input);

  const options = await page.$eval(selector, (el) =>
    Array.from((el as HTMLSelectElement).options)
      .map((option) => option.text.trim())
      .filter(Boolean),
  );

  const ranked = options
    .map((option) => {
      const normalizedOption = normalizeVehicleToken(option);
      let score = 0;

      if (normalizedOption === normalizedInput) score += 100;
      else if (
        normalizedOption.includes(normalizedInput) ||
        normalizedInput.includes(normalizedOption)
      ) {
        score += 60;
      }

      return { option, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    throw new Error(`No NIIP ${fieldLabel} option matched "${input}"`);
  }

  if (ranked.length === 1 || ranked[0].score > ranked[1].score) {
    return ranked[0].option;
  }

  const topCandidates = ranked
    .filter((entry) => entry.score === ranked[0].score)
    .slice(0, 5)
    .map((entry) => entry.option);

  throw new Error(
    `NIIP ${fieldLabel} was ambiguous for "${input}". Candidates: ${topCandidates.join(" | ")}`,
  );
}

export { SELECTORS as NIIP_SELECTORS };

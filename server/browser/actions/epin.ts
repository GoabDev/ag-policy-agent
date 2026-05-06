import { Page } from "playwright";
import { config } from "../../config";
import { getPage, saveSession, touchSession } from "../controller";
import { log } from "../../utils/logger";
import {
  PolicyStatusResult,
  PolicyStatusSummaryRow,
  PolicyStatusTrailRow,
  SwapCorrectionInput,
} from "../../types";
import { normalizeVehicleColor } from "../../utils/vehicleOptions";

const SELECTORS = {
  login: {
    usernameField: 'internal:role=textbox[name="Enter Username"i]',
    passwordField: 'internal:role=textbox[name="Enter Password"]',
    submitButton: 'internal:role=button[name="Logon"i]',
    dashboardIndicator: 'internal:text="Dashboard"i',
  },
  search: {
    selector: 'internal:label="Select Serach Option"i',
    searchField: 'internal:role=textbox[name="Search Option"i]',
    searchButton: 'internal:role=button[name="Fetch"i]',
  },
  loadingOverlay: "#UpdateProgress2",
  confirmationPanel: {
    confirmationPanel: 'internal:role=dialog[name="A&G: Application Message"i]',
    confirmButton: 'internal:role=button[name="Yes"i]',
    cancelButton: 'internal:role=button[name="No"i]',
    closeButton: 'internal:role=button[name="Close"i]',
    errorMessage: 'internal:role=text[name="Sorry. The Policy Number you"i]',
  },
  policy: {
    firstNameField: 'internal:role=textbox[name="First Name"i]',
    lastNameField: 'internal:role=textbox[name="Last Name"i]',
    engineField: 'internal:role=textbox[name="Engine No"i]',
    chassisNumberField: 'internal:role=textbox[name="Chasis No"i]',
    regNumberField: 'internal:role=textbox[name="Rgeistration No"i]',
    emailField: 'internal:role=textbox[name="Email"i]',
    phoneField: 'internal:role=textbox[name="Mobile Phone"i]',
    addressField: 'internal:role=textbox[name="Address"i]',
    vehicleMakeField: 'internal:label="Vehicle Make"i',
    vehicleModelField: 'internal:label="Vehicle Model"i',
    vehicleMakeModelField: 'internal:label="Vehicle Make & [Model]"i',
    // vehicleModelField: 'internal:label="Vehicle Model"i',
    vehicleYearField: 'internal:label="Vehicle Year"i',
    vehicleColorField: 'internal:label="Vehicle Color"i',
    vehicleValueTypeField: 'internal:label="Vehicle Value Type"i',
    saveButton: 'internal:role=button[name="Save"i]',
    error: 'internal:text="Sorry. The Policy Number you"',
    successMessage: 'internal:text="Record successfully Updated."i',
  },
  statusPage: {
    policyNumberField: 'internal:role=textbox[name="PolicyNo"i]',
    regNumberField: 'internal:role=textbox[name="txtregno"i]',
    searchPolicyButton: "btnpolicyno",
    searchRegButton: "#btnregno",
    tables: "table",
    resetButton: 'internal:role=link[name="Reset"i]',
    resetMessage: "#lblmessage",
  },
};

export async function loginToEPIN(): Promise<Page> {
  log("Logging into E-PIN platform...");
  const page = await getPage("epin");
  await page.goto(config.epin.url, { waitUntil: "networkidle" });

  try {
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, {
      timeout: 5000,
    });
    touchSession("epin");
  } catch {
    await page.fill(SELECTORS.login.usernameField, config.epin.username);
    await page.fill(SELECTORS.login.passwordField, config.epin.password);
    await page.click(SELECTORS.login.submitButton);
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, {
      timeout: 30000,
    });
  }

  await page.goto(config.epin.parkUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await saveSession("epin");
  log("E-PIN login successful");
  return page;
}

export async function searchEPINPolicy(
  page: Page,
  policyNumber: string,
): Promise<void> {
  log(`Refreshing browser and searching E-PIN policy: ${policyNumber}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.selectOption(SELECTORS.search.selector, "Fetch by Policy No");
  await page.fill(SELECTORS.search.searchField, policyNumber);
  await page.click(SELECTORS.search.searchButton);

  await waitForOverlayToDisappear(page, "searchEPINPolicy");

  const errorDialog = await page
    .waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
      timeout: 3000,
    })
    .catch(() => null);

  if (errorDialog) {
    const errorMsg = await page
      .textContent(SELECTORS.confirmationPanel.errorMessage)
      .catch(() => null);
    const message = errorMsg?.trim() || "Invalid policy number";
    log(`E-PIN error: ${message}`);
    await page.click(SELECTORS.confirmationPanel.closeButton);
    throw new Error(message);
  }

  log(`E-PIN policy ${policyNumber} loaded`);
}

export async function correctEPINName(
  page: Page,
  newFirstName: string,
  newLastName: string,
): Promise<{ oldFirstName: string; oldLastName: string }> {
  const oldFirstName = await page.inputValue(SELECTORS.policy.firstNameField);
  const oldLastName = await page.inputValue(SELECTORS.policy.lastNameField);
  log(`Old E-PIN name: ${oldFirstName} ${oldLastName}`);
  log(`Correcting E-PIN name to: ${newFirstName} ${newLastName}`);

  await page.fill(SELECTORS.policy.firstNameField, "");
  await page.fill(SELECTORS.policy.firstNameField, newFirstName);

  if (newLastName === "") {
    const existingLastName = await page.inputValue(
      SELECTORS.policy.lastNameField,
    );
    if (existingLastName.trim() === "") {
      await page.fill(SELECTORS.policy.lastNameField, ".");
    }
  } else {
    await page.fill(SELECTORS.policy.lastNameField, "");
    await page.fill(SELECTORS.policy.lastNameField, newLastName);
  }

  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);
  await waitForOverlayToDisappear(page, "correctEPINName");

  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Name correction saved on E-PIN");
  return { oldFirstName, oldLastName };
}

export async function correctEPINRegistration(
  page: Page,
  newRegNumber: string,
): Promise<string> {
  const regField = getEpinRegistrationField(page);
  const oldRegNumber = await regField.inputValue();
  log(`Old E-PIN registration number: ${oldRegNumber}`);
  log(`Correcting E-PIN registration to: ${newRegNumber}`);

  await regField.fill("");
  await regField.fill(newRegNumber);
  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);
  await waitForOverlayToDisappear(page, "correctEPINRegistration");

  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Registration correction saved on E-PIN");
  return oldRegNumber;
}

export async function correctEPINVehicleMake(
  page: Page,
  newMake: string,
  newModel: string,
): Promise<{ oldMake: string; oldModel: string }> {
  const oldCombined = await getSelectedOptionText(
    page,
    SELECTORS.policy.vehicleMakeModelField,
  );
  log(`Old E-PIN vehicle: ${oldCombined}`);
  log(`Correcting E-PIN vehicle make to: ${newMake} and model to: ${newModel}`);

  const optionLabel = await resolveEpinMakeModelOption(page, newMake, newModel);
  await page.selectOption(SELECTORS.policy.vehicleMakeModelField, {
    label: optionLabel,
  });
  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await waitForOverlayToDisappear(page, "correctEPINVehicleMake");

  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Vehicle make correction saved on E-PIN");
  return { oldMake: oldCombined, oldModel: "" };
}

export async function correctEPINRegAndChassis(
  page: Page,
  newRegNumber: string,
  newChassisNumber: string,
): Promise<{ oldRegNumber: string; oldChassisNumber: string }> {
  const oldRegNumber = await page.inputValue(SELECTORS.policy.regNumberField);
  const oldChassisNumber = await page.inputValue(
    SELECTORS.policy.chassisNumberField,
  );
  log(`Old E-PIN registration number: ${oldRegNumber}`);
  log(`Old E-PIN chassis number: ${oldChassisNumber}`);
  log(
    `Correcting E-PIN registration to: ${newRegNumber} and chassis to: ${newChassisNumber}`,
  );

  await page.fill(SELECTORS.policy.regNumberField, "");
  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
  await page.fill(SELECTORS.policy.chassisNumberField, "");
  await page.fill(SELECTORS.policy.chassisNumberField, newChassisNumber);
  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);
  await waitForOverlayToDisappear(page, "correctEPINRegAndChassis");

  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Registration and Chassis correction saved on E-PIN");
  return { oldRegNumber, oldChassisNumber };
}

export async function correctEPINChassis(
  page: Page,
  newChassisNumber: string,
): Promise<string> {
  const oldChassisNumber = await page.inputValue(
    SELECTORS.policy.chassisNumberField,
  );
  log(`Old E-PIN chassis number: ${oldChassisNumber}`);
  log(`Correcting E-PIN chassis to: ${newChassisNumber}`);

  await page.fill(SELECTORS.policy.chassisNumberField, "");
  await page.fill(SELECTORS.policy.chassisNumberField, newChassisNumber);
  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000);
  await waitForOverlayToDisappear(page, "correctEPINChassis");

  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Chassis correction saved on E-PIN");
  return oldChassisNumber;
}

export async function applyEPINSwap(
  page: Page,
  input: SwapCorrectionInput,
): Promise<Record<string, string>> {
  const previousData: Record<string, string> = {};
  let hasChanges = false;

  if (input.firstName) {
    previousData.firstName = await page.inputValue(
      SELECTORS.policy.firstNameField,
    );
    await page.fill(SELECTORS.policy.firstNameField, "");
    await page.fill(SELECTORS.policy.firstNameField, input.firstName);
    hasChanges = true;
  }

  if (input.lastName) {
    previousData.lastName = await page.inputValue(
      SELECTORS.policy.lastNameField,
    );
    await page.fill(SELECTORS.policy.lastNameField, "");
    await page.fill(SELECTORS.policy.lastNameField, input.lastName);
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
      SELECTORS.policy.engineField,
    );
    await page.fill(SELECTORS.policy.engineField, "");
    await page.fill(SELECTORS.policy.engineField, input.engineNumber);
    hasChanges = true;
  }

  if (input.newRegistrationNumber) {
    previousData.registrationNumber =
      await getEpinRegistrationField(page).inputValue();
    await getEpinRegistrationField(page).fill("");
    await getEpinRegistrationField(page).fill(input.newRegistrationNumber);
    hasChanges = true;
  }

  if (input.newChassisNumber) {
    previousData.chassisNumber = await page.inputValue(
      SELECTORS.policy.chassisNumberField,
    );
    await page.fill(SELECTORS.policy.chassisNumberField, "");
    await page.fill(
      SELECTORS.policy.chassisNumberField,
      input.newChassisNumber,
    );
    hasChanges = true;
  }

  if (input.vehicleColor) {
    const normalizedColor = normalizeVehicleColor(input.vehicleColor);
    previousData.vehicleColor = await getSelectedOptionText(
      page,
      SELECTORS.policy.vehicleColorField,
    );
    await page.selectOption(SELECTORS.policy.vehicleColorField, {
      label: normalizedColor,
    });
    hasChanges = true;
  }

  if (input.newVehicleMake && input.newVehicleModel) {
    previousData.vehicleMakeModel = await getSelectedOptionText(
      page,
      SELECTORS.policy.vehicleMakeModelField,
    );
    const optionLabel = await resolveEpinMakeModelOption(
      page,
      input.newVehicleMake,
      input.newVehicleModel,
    );
    await page.selectOption(SELECTORS.policy.vehicleMakeModelField, {
      label: optionLabel,
    });
    hasChanges = true;
  }

  if (input.vehicleYear) {
    previousData.vehicleYear = await page
      .inputValue(SELECTORS.policy.vehicleYearField)
      .catch(() => "");
    await page.fill(SELECTORS.policy.vehicleYearField, "");
    await page.fill(SELECTORS.policy.vehicleYearField, input.vehicleYear);
    hasChanges = true;
  }

  if (input.address) {
    previousData.address = await page.inputValue(SELECTORS.policy.addressField);
    await page.fill(SELECTORS.policy.addressField, "");
    await page.fill(SELECTORS.policy.addressField, input.address);
    hasChanges = true;
  }

  if (!hasChanges) {
    throw new Error("No E-PIN swap fields were provided");
  }

  await page.click(SELECTORS.policy.saveButton);
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.confirmButton);
  await page.waitForTimeout(1000);
  await waitForOverlayToDisappear(page, "applyEPINSwap");
  await page.waitForSelector(SELECTORS.policy.successMessage, {
    timeout: 15000,
  });
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log("Swap correction saved on E-PIN");
  return previousData;
}

export async function getEPINPolicyPage(): Promise<Page> {
  const page = await getPage("epin");
  const currentUrl = page.url();

  if (currentUrl.includes("PolicyUpdateNIIP.aspx")) {
    touchSession("epin");
    return page;
  }

  return loginToEPIN();
}

export async function openEPINPolicyStatusPage(page: Page): Promise<void> {
  await page.goto(config.epin.policyStatusUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => undefined);
}

export async function searchEPINPolicyStatus(
  page: Page,
  lookupValue: string,
  lookupType: "policy_number" | "registration",
): Promise<void> {
  log(`Searching E-PIN policy status by ${lookupType}: ${lookupValue}`);

  const searchField =
    lookupType === "registration"
      ? page.locator(SELECTORS.statusPage.regNumberField).first()
      : page.locator(SELECTORS.statusPage.policyNumberField).first();
  await searchField.waitFor({ state: "visible", timeout: 15000 });
  await searchField.fill("");
  await searchField.fill(lookupValue);

  const rawSearchButtonSelector =
    lookupType === "registration"
      ? SELECTORS.statusPage.searchRegButton
      : SELECTORS.statusPage.searchPolicyButton;
  const searchButtonSelector = normalizeStatusPageSelector(
    rawSearchButtonSelector,
  );
  const searchButton = page.locator(searchButtonSelector).first();
  await searchButton.click();

  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => undefined);
  await Promise.race([
    page
      .getByText("Trail Date", { exact: false })
      .waitFor({ state: "visible", timeout: 15000 }),
    page
      .getByText("Reset Push", { exact: false })
      .waitFor({ state: "visible", timeout: 15000 }),
    page.waitForSelector(SELECTORS.statusPage.resetMessage, { timeout: 15000 }),
  ]).catch(() => undefined);
}

export async function extractEPINPolicyStatus(
  page: Page,
  lookupValue: string,
  lookupType: "policy_number" | "registration",
): Promise<PolicyStatusResult> {
  const { summaryRows, trailRows, message } = await page.evaluate(
    ({ resetMessageSelector }) => {
      const tables = Array.from(document.querySelectorAll("table"));
      const extractCells = (row: HTMLTableRowElement) =>
        Array.from(row.querySelectorAll("th,td")).map(
          (cell) => cell.textContent?.trim() || "",
        );

      let summaryRows: PolicyStatusSummaryRow[] = [];
      let trailRows: PolicyStatusTrailRow[] = [];
      const message =
        document.querySelector(resetMessageSelector)?.textContent?.trim() || "";

      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll("tr"));
        if (rows.length < 2) continue;

        const headers = extractCells(rows[0]).map((value) =>
          value.toLowerCase(),
        );
        const hasSummaryHeaders =
          headers.includes("policyno") &&
          headers.includes("regno") &&
          headers.includes("coverdate");
        const hasTrailHeaders =
          headers.includes("trail date") &&
          headers.includes("time") &&
          headers.includes("response");

        if (hasSummaryHeaders) {
          summaryRows = rows
            .slice(1)
            .map((row) => {
              const cells = Array.from(row.querySelectorAll("td"));
              if (cells.length < 7) return null;

              return {
                policyNo: cells[1]?.textContent?.trim() || "",
                regNo: cells[2]?.textContent?.trim() || "",
                coverDate: cells[3]?.textContent?.trim() || "",
                vehicleMake: cells[4]?.textContent?.trim() || "",
                vehicleModel: cells[5]?.textContent?.trim() || "",
                response: cells[6]?.textContent?.trim() || "",
                canReset: Boolean(
                  cells[0]?.querySelector(
                    "button, input[type='button'], input[type='submit'], a",
                  ),
                ),
              };
            })
            .filter(Boolean) as PolicyStatusSummaryRow[];
        }

        if (hasTrailHeaders) {
          trailRows = rows
            .slice(1)
            .map((row) => {
              const cells = Array.from(row.querySelectorAll("td"));
              if (cells.length < 5) return null;

              return {
                trailDate: cells[0]?.textContent?.trim() || "",
                time: cells[1]?.textContent?.trim() || "",
                policyNo: cells[2]?.textContent?.trim() || "",
                response: cells[3]?.textContent?.trim() || "",
                server: cells[4]?.textContent?.trim() || "",
              };
            })
            .filter(Boolean) as PolicyStatusTrailRow[];
        }
      }

      return { summaryRows, trailRows, message };
    },
    { resetMessageSelector: SELECTORS.statusPage.resetMessage },
  );

  return {
    lookupValue,
    lookupType,
    message: message || undefined,
    summaryRows,
    trailRows,
  };
}

export async function resetEPINPolicyStatusPush(
  page: Page,
  policyNumber: string,
): Promise<void> {
  log(`Resetting E-PIN policy push for: ${policyNumber}`);

  const resetButtonSelector = SELECTORS.statusPage.resetButton.replace(
    "{policyNumber}",
    policyNumber,
  );
  const resetButton = page.locator(resetButtonSelector).first();

  await resetButton.waitFor({ state: "visible", timeout: 15000 });
  await resetButton.click({ noWaitAfter: true });

  await waitForOverlayToDisappear(page, "resetEPINPolicyStatusPush");
  await page
    .waitForSelector(SELECTORS.statusPage.resetMessage, { timeout: 20000 })
    .catch(async () => {
      await page.waitForLoadState("networkidle", { timeout: 20000 });
      await page.waitForSelector(SELECTORS.statusPage.resetMessage, {
        timeout: 10000,
      });
    });
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => undefined);
}

function getEpinRegistrationField(page: Page) {
  return page.getByRole("textbox", {
    name: "Rgeistration No",
    exact: true,
  });
}

function normalizeStatusPageSelector(selector: string): string {
  return /^[A-Za-z0-9_-]+$/.test(selector) ? `#${selector}` : selector;
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

async function resolveEpinMakeModelOption(
  page: Page,
  make: string,
  model: string,
): Promise<string> {
  const normalizedMake = normalizeVehicleToken(make);
  const normalizedModel = normalizeVehicleToken(model);

  const options = await page.$eval(
    SELECTORS.policy.vehicleMakeModelField,
    (el) =>
      Array.from((el as HTMLSelectElement).options).map((option) =>
        option.text.trim(),
      ),
  );

  const ranked = options
    .map((option) => {
      const [optionMakeRaw, optionModelRaw = ""] = option.split(":");
      const optionMake = normalizeVehicleToken(optionMakeRaw);
      const optionModel = normalizeVehicleToken(optionModelRaw);
      const optionFull = normalizeVehicleToken(option);

      let score = 0;
      if (optionMake === normalizedMake) score += 100;
      else if (
        optionMake.includes(normalizedMake) ||
        normalizedMake.includes(optionMake)
      )
        score += 60;

      if (optionModel === normalizedModel) score += 100;
      else if (
        optionModel.includes(normalizedModel) ||
        normalizedModel.includes(optionModel)
      )
        score += 60;

      if (optionFull.includes(normalizedMake)) score += 20;
      if (optionFull.includes(normalizedModel)) score += 20;

      return { option, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    throw new Error(
      `No E-PIN vehicle make/model option matched make "${make}" and model "${model}"`,
    );
  }

  if (ranked.length === 1 || ranked[0].score > ranked[1].score) {
    return ranked[0].option;
  }

  const topCandidates = ranked
    .filter((entry) => entry.score === ranked[0].score)
    .slice(0, 5)
    .map((entry) => entry.option);

  throw new Error(
    `E-PIN vehicle make/model was ambiguous for make "${make}" and model "${model}". Candidates: ${topCandidates.join(" | ")}`,
  );
}

async function waitForOverlayToDisappear(
  page: Page,
  context: string,
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
      SELECTORS.loadingOverlay,
      { timeout: 30000, polling: 100 },
    );
  } catch {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(
      `E-PIN loading overlay did not disappear after ${elapsed}s during: ${context}`,
      "error",
    );
    throw new Error(
      `E-PIN loading overlay timed out after ${elapsed}s during: ${context}`,
    );
  }

  const elapsed = Date.now() - start;
  if (elapsed > 10000) {
    log(
      `E-PIN loading overlay was slow (${(elapsed / 1000).toFixed(1)}s) during: ${context}`,
      "warn",
    );
  }
}

export { SELECTORS as EPIN_SELECTORS };

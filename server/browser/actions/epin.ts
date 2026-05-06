import { Page } from "playwright";
import { config } from "../../config";
import { getPage, saveSession, touchSession } from "../controller";
import { log } from "../../utils/logger";

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
    chassisNumberField: 'internal:role=textbox[name="Chasis No"i]',
    regNumberField: 'internal:role=textbox[name="Rgeistration No"i]',
    vehicleMakeField: 'internal:label="Vehicle Make"i',
    vehicleModelField: 'internal:label="Vehicle Model"i',
    vehicleYearField: 'internal:label="Vehicle Year"i',
    vehicleColorField: 'internal:label="Vehicle Color"i',
    vehicleValueTypeField: 'internal:label="Vehicle Value Type"i',
    saveButton: 'internal:role=button[name="Save"i]',
    error: 'internal:text="Sorry. The Policy Number you"',
    successMessage: 'internal:text="Record successfully Updated."i',
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
  const oldMake = await page.$eval(
    SELECTORS.policy.vehicleMakeField,
    (el) => (el as HTMLSelectElement).value,
  );
  const oldModel = await page.$eval(
    SELECTORS.policy.vehicleModelField,
    (el) => (el as HTMLSelectElement).value,
  );
  log(`Old E-PIN vehicle: ${oldMake} ${oldModel}`);
  log(`Correcting E-PIN vehicle make to: ${newMake} and model to: ${newModel}`);

  await page.selectOption(SELECTORS.policy.vehicleMakeField, newMake);
  await waitForOverlayToDisappear(page, "correctEPINVehicleMake:makePostback");
  await page.selectOption(SELECTORS.policy.vehicleModelField, newModel);
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
  return { oldMake, oldModel };
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

export async function getEPINPolicyPage(): Promise<Page> {
  const page = await getPage("epin");
  const currentUrl = page.url();

  if (currentUrl.includes("PolicyUpdateNIIP.aspx")) {
    touchSession("epin");
    return page;
  }

  return loginToEPIN();
}

function getEpinRegistrationField(page: Page) {
  return page.getByRole("textbox", {
    name: "Rgeistration No",
    exact: true,
  });
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

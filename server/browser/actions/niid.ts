import { Page } from 'playwright';
import { getPage, saveSession, touchSession } from '../controller';
import { log } from '../../utils/logger';
import { config } from '../../config';
import { getNetworkTimeoutMs, getQuickCheckTimeoutMs } from '../timeoutSettings';

// ============================================
// SELECTORS — Update these after mapping the real NIID site
// ============================================
// TODO: Replace with real selectors from screenshots
const SELECTORS = {
  // Login page
  login: {
    usernameField: '#username',       // TODO: update
    passwordField: '#password',       // TODO: update
    captchaArea: '.captcha',          // TODO: update (for detection only)
    submitButton: '#login-btn',       // TODO: update
    dashboardIndicator: 'internal:role=cell[name="Home My Account Logout Help"i]', // TODO: element visible after login
  },

  // Policy search on NIID
  search: {
    policyNumberField: '#ctl00_MainContent_txtPolicyNo',    
    regNumberField: '#ctl00_MainContent_txtRegNumber',          
    searchButton: 'internal:role=button[name="Search"i]',            
    resultRow: '.result-row',               
    resultLink: '.result-row a',            
  },

  // Policy detail / correction form
  policy: {
    emailField: '#MainContent_txtEmail',
    regNumberField: '#MainContent_txtRegNo',     
    oldLicenceNumberField: '#MainContent_txtOldRegNo',     
    chassisNumberField: '#MainContent_txtChasisNo',     
    saveButton: 'internal:role=button[name="Change"i]',                
    successMessage: 'internal:text="Successfully Updated."i',       
  },
};

// ============================================
// Check if logged into NIID (session still valid)
// ============================================

export async function checkNIIDSession(): Promise<boolean> {
  try {
    const page = await getPage('niid');
    await page.goto(config.niid.policyCorrectionUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });

    // Check if we land on dashboard (session alive) or login page
    try {
      await page.waitForSelector(SELECTORS.login.dashboardIndicator, { timeout: getQuickCheckTimeoutMs() });
      log('NIID session is active ✅');
      touchSession('niid');
      return true;
    } catch {
      log('NIID session expired — manual re-login needed', 'warn');
      return false;
    }
  } catch (err: any) {
    log(`NIID session check failed: ${err.message}`, 'error');
    return false;
  }
}

// ============================================
// Search for policy on NIID using policy number + old reg
// ============================================

export async function searchNIIDPolicy(
  page: Page,
  policyNumber: string,
  oldRegNumber: string
): Promise<void> {
  log(`Searching NIID for policy: ${policyNumber}, reg: ${oldRegNumber}`);

  let policyNotFound = false;

  const dialogHandler = async (dialog: any) => {
    log(`NIID Dialog message: ${dialog.message()}`);
    if (dialog.message().toLowerCase().includes('policy does not exist')) {
      policyNotFound = true;
    }
    await dialog.dismiss().catch(() => {});
  };

  page.on('dialog', dialogHandler);

  try {
    // Page should already be on Change_Request.aspx via getNIIDPolicyPage()
    // Fill search fields
    await page.fill(SELECTORS.search.policyNumberField, policyNumber);
    await page.fill(SELECTORS.search.regNumberField, oldRegNumber);
    await page.click(SELECTORS.search.searchButton);

    // Wait briefly for a potential error dialog
    await page.waitForTimeout(2000);

    if (policyNotFound) {
      throw new Error(`Policy ${policyNumber} does not exist on NIID`);
    }

    // Wait for form to load
    await page.waitForSelector(SELECTORS.policy.regNumberField, { timeout: getNetworkTimeoutMs() });

    log('NIID policy loaded');
  } finally {
    page.off('dialog', dialogHandler);
  }
}

// ============================================
// Correct registration number on NIID
// ============================================

export async function correctNIIDRegistration(
  page: Page,
  newRegNumber: string
): Promise<void> {
  log(`Correcting NIID registration to: ${newRegNumber}`);

  let dialogHandled = false;

  // Set up dialog handler before clicking
  const dialogHandler = async (dialog: any) => {
    log(`NIID Dialog message: ${dialog.message()}`);
    if (dialog.message().toLowerCase().includes('successfully updated')) {
      dialogHandled = true;
    }
    await dialog.dismiss().catch(() => {});
  };

  page.on('dialog', dialogHandler);

  try {
    // 1. Check and potentially update Email Field
    const currentEmail = await page.inputValue(SELECTORS.policy.emailField);
    log(`Current NIID Email: ${currentEmail}`);

    if (currentEmail.includes('@') || currentEmail.toUpperCase() === 'TBA') {
      log('Email update required. Setting to: info@aginsuranceplc.com');
      await page.fill(SELECTORS.policy.emailField, '');
      await page.fill(SELECTORS.policy.emailField, 'info@aginsuranceplc.com');
    }

    // 2. Update Registration Number
    await page.fill(SELECTORS.policy.regNumberField, '');
    await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
    await page.fill(SELECTORS.policy.oldLicenceNumberField, '');
    await page.fill(SELECTORS.policy.oldLicenceNumberField, newRegNumber);
    await page.click(SELECTORS.policy.saveButton);

    // If successMessage is also in the DOM, wait for it. 
    // Otherwise, we rely on the dialog having been handled.
    try {
      await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: getNetworkTimeoutMs() });
      log('Success message detected in DOM ✅');
    } catch {
      if (dialogHandled) {
        log('Success confirmed via browser dialog ✅');
      } else {
        throw new Error('Neither success message nor success dialog was detected');
      }
    }

    // Save session after successful action
    await saveSession('niid');
    log('Registration correction saved on NIID ✅');

  } finally {
    // Clean up listener
    page.off('dialog', dialogHandler);
  }
}

// ============================================
// Correct registration + chassis on NIID
// ============================================

export async function correctNIIDRegAndChassis(
  page: Page,
  newRegNumber: string,
  newChassisNumber: string
): Promise<void> {
  log(`Correcting NIID registration to: ${newRegNumber} and chassis to: ${newChassisNumber}`);

  let dialogHandled = false;

  const dialogHandler = async (dialog: any) => {
    log(`NIID Dialog message: ${dialog.message()}`);
    if (dialog.message().toLowerCase().includes('successfully updated')) {
      dialogHandled = true;
    }
    await dialog.dismiss().catch(() => {});
  };

  page.on('dialog', dialogHandler);

  try {
    // 1. Check and potentially update Email Field
    const currentEmail = await page.inputValue(SELECTORS.policy.emailField);
    log(`Current NIID Email: ${currentEmail}`);

    if (currentEmail.includes('@') || currentEmail.toUpperCase() === 'TBA') {
      log('Email update required. Setting to: info@aginsuranceplc.com');
      await page.fill(SELECTORS.policy.emailField, '');
      await page.fill(SELECTORS.policy.emailField, 'info@aginsuranceplc.com');
    }

    // 2. Update Registration Number
    await page.fill(SELECTORS.policy.regNumberField, '');
    await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
    await page.fill(SELECTORS.policy.oldLicenceNumberField, '');
    await page.fill(SELECTORS.policy.oldLicenceNumberField, newRegNumber);

    // 3. Update Chassis Number
    await page.fill(SELECTORS.policy.chassisNumberField, '');
    await page.fill(SELECTORS.policy.chassisNumberField, newChassisNumber);

    await page.click(SELECTORS.policy.saveButton);

    try {
      await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: getNetworkTimeoutMs() });
      log('Success message detected in DOM ✅');
    } catch {
      if (dialogHandled) {
        log('Success confirmed via browser dialog ✅');
      } else {
        throw new Error('Neither success message nor success dialog was detected');
      }
    }

    await saveSession('niid');
    log('Registration and Chassis correction saved on NIID ✅');

  } finally {
    page.off('dialog', dialogHandler);
  }
}

// ============================================
// Correct chassis on NIID
// ============================================

export async function correctNIIDChassis(
  page: Page,
  newChassisNumber: string
): Promise<void> {
  log(`Correcting NIID chassis to: ${newChassisNumber}`);

  let dialogHandled = false;

  const dialogHandler = async (dialog: any) => {
    log(`NIID Dialog message: ${dialog.message()}`);
    if (dialog.message().toLowerCase().includes('successfully updated')) {
      dialogHandled = true;
    }
    await dialog.dismiss().catch(() => {});
  };

  page.on('dialog', dialogHandler);

  try {
    // 1. Check and potentially update Email Field
    const currentEmail = await page.inputValue(SELECTORS.policy.emailField);
    log(`Current NIID Email: ${currentEmail}`);

    if (currentEmail.includes('@') || currentEmail.toUpperCase() === 'TBA') {
      log('Email update required. Setting to: info@aginsuranceplc.com');
      await page.fill(SELECTORS.policy.emailField, '');
      await page.fill(SELECTORS.policy.emailField, 'info@aginsuranceplc.com');
    }

    // 2. Update Chassis Number
    await page.fill(SELECTORS.policy.chassisNumberField, '');
    await page.fill(SELECTORS.policy.chassisNumberField, newChassisNumber);

    await page.click(SELECTORS.policy.saveButton);

    try {
      await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: getNetworkTimeoutMs() });
      log('Success message detected in DOM ✅');
    } catch {
      if (dialogHandled) {
        log('Success confirmed via browser dialog ✅');
      } else {
        throw new Error('Neither success message nor success dialog was detected');
      }
    }

    await saveSession('niid');
    log('Chassis correction saved on NIID ✅');

  } finally {
    page.off('dialog', dialogHandler);
  }
}

// ============================================
// Get NIID page already parked on Change Request
// (skips navigation if keep-alive is active)
// ============================================

export async function getNIIDPolicyPage(): Promise<Page> {
  const page = await getPage('niid');
  const currentUrl = page.url();

  // Detect expired session — NIID redirects to default.aspx (login page)
  if (currentUrl.includes('/default.aspx')) {
    log('NIID session expired (redirected to login) — manual re-login required (CAPTCHA)', 'warn');
    throw new Error('NIID session has expired. Please login to NIID manually and retry.');
  }

  if (currentUrl.includes('Change_Request.aspx')) {
    log('NIID already on Change Request page — skipping navigation');
    touchSession('niid');
    return page;
  }

  // Fallback: try navigating to the park page
  log('NIID not on Change Request page, navigating...');
  await page.goto(config.niid.policyCorrectionUrl, { waitUntil: 'domcontentloaded', timeout: getNetworkTimeoutMs() });

  // Check if we got redirected to login
  const landedUrl = page.url();
  if (landedUrl.includes('/default.aspx')) {
    log('NIID session expired after navigation — manual re-login required (CAPTCHA)', 'warn');
    throw new Error('NIID session has expired. Please login to NIID manually and retry.');
  }

  touchSession('niid');
  return page;
}

// Export selectors for later updating
export { SELECTORS as NIID_SELECTORS };

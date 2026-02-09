import { Page } from 'playwright';
import { config } from '../../config';
import { getPage, saveSession, touchSession } from '../controller';
import { log } from '../../utils/logger';

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
    dashboardIndicator: '.dashboard', // TODO: element visible after login
  },

  // Policy search on NIID
  search: {
    policyNumberField: '#policy-number',    // TODO: update
    regNumberField: '#reg-number',          // TODO: update
    searchButton: '#search-btn',            // TODO: update
    resultRow: '.result-row',               // TODO: update
    resultLink: '.result-row a',            // TODO: update
  },

  // Policy detail / correction form
  policy: {
    regNumberField: '#niid-reg-number',     // TODO: update
    saveButton: '#save-btn',                // TODO: update
    successMessage: '.success-alert',       // TODO: update
  },
};

// ============================================
// Check if logged into NIID (session still valid)
// ============================================

export async function checkNIIDSession(): Promise<boolean> {
  try {
    const page = await getPage('niid');
    await page.goto(config.niid.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Check if we land on dashboard (session alive) or login page
    try {
      await page.waitForSelector(SELECTORS.login.dashboardIndicator, { timeout: 5000 });
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

  // Navigate to NIID search page (adjust URL as needed)
  await page.goto(`${config.niid.url}`, { waitUntil: 'networkidle' });

  // Fill search fields
  await page.fill(SELECTORS.search.policyNumberField, policyNumber);
  await page.fill(SELECTORS.search.regNumberField, oldRegNumber);
  await page.click(SELECTORS.search.searchButton);

  // Wait for results
  await page.waitForSelector(SELECTORS.search.resultRow, { timeout: 20000 });

  // Click into the result
  await page.click(SELECTORS.search.resultLink);

  // Wait for form to load
  await page.waitForSelector(SELECTORS.policy.regNumberField, { timeout: 15000 });

  log('NIID policy loaded');
}

// ============================================
// Correct registration number on NIID
// ============================================

export async function correctNIIDRegistration(
  page: Page,
  newRegNumber: string
): Promise<void> {
  log(`Correcting NIID registration to: ${newRegNumber}`);

  await page.fill(SELECTORS.policy.regNumberField, '');
  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
  await page.click(SELECTORS.policy.saveButton);

  // Wait for success
  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });

  // Save session after successful action
  await saveSession('niid');

  log('Registration correction saved on NIID ✅');
}

// Export selectors for later updating
export { SELECTORS as NIID_SELECTORS };
import { Page } from 'playwright';
import { config } from '../../config';
import { getPage, saveSession, touchSession } from '../controller';
import { log } from '../../utils/logger';

// ============================================
// SELECTORS — Update these after mapping the real site
// ============================================
// TODO: Replace with real selectors from screenshots
const SELECTORS = {
  // Login page
  login: {
    usernameField: 'internal:role=textbox[name="Username"i]',       // TODO: update
    // passwordField: 'internal:role=textbox[name="Password"i]',       // TODO: update
    submitButton: 'internal:role=button[name="Login"i]',       // TODO: update
    dashboardIndicator: '.dashboard', // TODO: element visible after successful login
  },

  // Policy search
  search: {
    searchField: '#policy-search',           // TODO: update
    searchButton: '#search-btn',             // TODO: update
    resultRow: '.policy-result-row',         // TODO: first result
    resultPolicyLink: '.policy-result-row a', // TODO: link to policy
  },

  // Policy detail / edit form
  policy: {
    nameField: '#policyholder-name',      // TODO: update
    regNumberField: '#registration-number', // TODO: update
    vehicleMakeField: '#vehicle-make',     // TODO: update
    saveButton: '#save-btn',               // TODO: update
    successMessage: '.success-alert',       // TODO: update
  },
};

// ============================================
// Login to A&G (fully automated, no captcha)
// ============================================

export async function loginToAG(): Promise<Page> {
  log('Logging into A&G Platform...');
  const page = await getPage('ag');

  await page.goto(`${config.ag.url}`, { waitUntil: 'networkidle' });

  // Check if already logged in
  try {
    await page.waitForSelector(SELECTORS.login.dashboardIndicator, { timeout: 5000 });
    log('Already logged into A&G');
    touchSession('ag');
    return page;
  } catch {
    // Not logged in, proceed with login
  }

  // Fill login form
  await page.fill(SELECTORS.login.usernameField, config.ag.username);
  // await page.fill(SELECTORS.login.passwordField, config.ag.password);
  await page.click(SELECTORS.login.submitButton);

  // Wait for dashboard to load
  await page.waitForSelector(SELECTORS.login.dashboardIndicator, { timeout: 30000 });

  // Save session
  await saveSession('ag');
  log('A&G login successful ✅');

  return page;
}

// ============================================
// Search for a policy by number
// ============================================

export async function searchPolicy(page: Page, policyNumber: string): Promise<void> {
  log(`Searching for policy: ${policyNumber}`);

  // Navigate to search or use search bar
  await page.fill(SELECTORS.search.searchField, policyNumber);
  await page.click(SELECTORS.search.searchButton);

  // Wait for results
  await page.waitForSelector(SELECTORS.search.resultRow, { timeout: 15000 });

  // Click into the policy
  await page.click(SELECTORS.search.resultPolicyLink);

  // Wait for policy detail page to load
  await page.waitForSelector(SELECTORS.policy.nameField, { timeout: 15000 });

  log(`Policy ${policyNumber} loaded`);
}

// ============================================
// Correction Actions
// ============================================

export async function correctName(page: Page, newName: string): Promise<void> {
  log(`Correcting name to: ${newName}`);

  await page.fill(SELECTORS.policy.nameField, ''); // Clear existing
  await page.fill(SELECTORS.policy.nameField, newName);
  await page.click(SELECTORS.policy.saveButton);

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });
  log('Name correction saved on A&G ✅');
}

export async function correctRegistration(
  page: Page,
  newRegNumber: string
): Promise<string> {
  // First, read the OLD registration number (needed for NIID lookup)
  const oldRegNumber = await page.inputValue(SELECTORS.policy.regNumberField);
  log(`Old registration number: ${oldRegNumber}`);

  // Update to new reg number
  log(`Correcting registration to: ${newRegNumber}`);
  await page.fill(SELECTORS.policy.regNumberField, '');
  await page.fill(SELECTORS.policy.regNumberField, newRegNumber);
  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });
  log('Registration correction saved on A&G ✅');

  return oldRegNumber; // Return old reg for NIID
}

export async function correctVehicleMake(page: Page, newMake: string): Promise<void> {
  log(`Correcting vehicle make to: ${newMake}`);

  await page.fill(SELECTORS.policy.vehicleMakeField, '');
  await page.fill(SELECTORS.policy.vehicleMakeField, newMake);
  await page.click(SELECTORS.policy.saveButton);

  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });
  log('Vehicle make correction saved on A&G ✅');
}

// Export selectors so they can be updated from config later
export { SELECTORS as AG_SELECTORS };
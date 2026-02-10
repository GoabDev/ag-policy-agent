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
    passwordField: 'internal:role=textbox[name="Password"i]',       // TODO: update
    submitButton: 'internal:role=button[name="Logon"i]',       // TODO: update
    dashboardIndicator: 'internal:text="Dashboard"', // TODO: element visible after successful login
  },
  // Update Policy navigator
  navigator: {
    policyOperations: 'internal:role=link[name=" Policy Operations "i]',            
    updatePolicy: 'internal:role=link[name="Update Policy"i]',            
  },
  // Policy search
  search: {    
    selector: 'internal:label="Select Serach Option"i',
    searchField: 'internal:role=textbox[name="Search Option"i]',          
    searchButton: 'internal:role=button[name="Fetch"i]',            
    resultRow: '.policy-result-row',        
    resultPolicyLink: '.policy-result-row a', 
  },

  loadingOverlay: '.ui-widget-overlay',

  confirmationPanel: {
    confirmationPanel: 'internal:role=dialog[name="A&G: Application Message"i]',
    confirmButton: 'internal:role=button[name="Yes"i]',
    cancelButton: 'internal:role=button[name="No"i]',
    closeButton: 'internal:role=button[name="Close"i]',
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
  await page.fill(SELECTORS.login.passwordField, config.ag.password);
  await page.click(SELECTORS.login.submitButton);

  // Wait for dashboard to load
  await page.waitForSelector(SELECTORS.login.dashboardIndicator, { timeout: 30000 });

  // Save session
  await saveSession('ag');
  log('A&G login successful ✅');

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
// ============================================
// Search for a policy by number
// ============================================

export async function searchPolicy(page: Page, policyNumber: string): Promise<void> {
  log(`Refreshing browser and searching for policy: ${policyNumber}`);

  // Refresh to clear previous errors/states (as suggested to avoid unhandled states)
  await page.reload({ waitUntil: 'networkidle' });

  // Navigate to selector and select fetch by policy number
  await page.selectOption(SELECTORS.search.selector, 'Fetch by Policy No');

  // Navigate to search or use search bar
  await page.fill(SELECTORS.search.searchField, policyNumber);

  // CLick Fetch button
  await page.click(SELECTORS.search.searchButton);

  await page.waitForTimeout(1000)

  // Wait for loading overlay to disappear
  await page.waitForSelector(SELECTORS.loadingOverlay, { state: 'hidden', timeout: 15000 });

  // Wait for policy detail page to load
  await page.waitForSelector(SELECTORS.policy.firstNameField, { timeout: 15000 });

  log(`Policy ${policyNumber} loaded`);
}

// ============================================
// Correction Actions
// ============================================

export async function correctName(
  page: Page,
  newFirstName: string,
  newLastName: string
): Promise<void> {
  log(`Correcting name to: ${newFirstName} ${newLastName}`);

  await page.fill(SELECTORS.policy.firstNameField, ''); // Clear existing
  await page.fill(SELECTORS.policy.firstNameField, newFirstName);

  // If newLastName is empty string, check the current value in the field
  if (newLastName === '') {
    const existingLastName = await page.inputValue(SELECTORS.policy.lastNameField);
    if (existingLastName.trim() === '') {
      // If it's also an empty string, set it to "."
      await page.fill(SELECTORS.policy.lastNameField, '.');
    }
    // else we ignore it (don't fill anything)
  } else {
    // Normal update
    await page.fill(SELECTORS.policy.lastNameField, ''); // Clear existing
    await page.fill(SELECTORS.policy.lastNameField, newLastName);
  }

  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, { timeout: 15000 });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000)

  // Wait for loading overlay to disappear
  await page.waitForSelector(SELECTORS.loadingOverlay, { state: 'hidden', timeout: 15000 });

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });
  
  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

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

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, { timeout: 15000 });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  await page.waitForTimeout(1000)

  // Wait for loading overlay to disappear
  await page.waitForSelector(SELECTORS.loadingOverlay, { state: 'hidden', timeout: 15000 });

  // Wait for success confirmation (This might appear as another confirmation panel)
  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);
 
  log('Registration correction saved on A&G ✅');

  return oldRegNumber; // Return old reg for NIID
}

export async function correctVehicleMake(
  page: Page,
  newMake: string,
  newModel: string
): Promise<void> {
  log(`Correcting vehicle make to: ${newMake} and model to: ${newModel}`);

  await page.fill(SELECTORS.policy.vehicleMakeField, '');
  await page.fill(SELECTORS.policy.vehicleMakeField, newMake);

  await page.fill(SELECTORS.policy.vehicleModelField, '');
  await page.fill(SELECTORS.policy.vehicleModelField, newModel);

  await page.click(SELECTORS.policy.saveButton);

  // Wait for confirmation panel
  await page.waitForSelector(SELECTORS.confirmationPanel.confirmationPanel, { timeout: 15000 });

  // Click confirm button
  await page.click(SELECTORS.confirmationPanel.confirmButton);

  // Wait for loading overlay to disappear
  await page.waitForSelector(SELECTORS.loadingOverlay, { state: 'hidden', timeout: 15000 });

  // Wait for success confirmation
  await page.waitForSelector(SELECTORS.policy.successMessage, { timeout: 15000 });

  // Click confirm on the success dialog
  await page.click(SELECTORS.confirmationPanel.closeButton);

  log('Vehicle make correction saved on A&G ✅');
}

// ============================================
// Get A&G page already parked on Update Policy
// (skips login + navigation if keep-alive is active)
// ============================================

export async function getAGPolicyPage(): Promise<Page> {
  const page = await getPage('ag');
  const currentUrl = page.url();

  // Detect expired session — A&G redirects to ErrorPage.aspx
  if (currentUrl.includes('ErrorPage.aspx')) {
    log('A&G session expired (on error page), re-logging in...', 'warn');
    const loggedInPage = await loginToAG();
    await navigateToPolicy(loggedInPage);
    return loggedInPage;
  }

  if (currentUrl.includes('Policy_Update.aspx')) {
    log('A&G already on Update Policy page — skipping login & navigation');
    touchSession('ag');
    return page;
  }

  // Fallback: session lost or page navigated away — do full login + navigate
  log('A&G not on Update Policy page, falling back to login + navigate...');
  const loggedInPage = await loginToAG();
  await navigateToPolicy(loggedInPage);
  return loggedInPage;
}

// Export selectors so they can be updated from config later
export { SELECTORS as AG_SELECTORS };
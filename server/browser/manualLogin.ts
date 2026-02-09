import { chromium } from 'playwright';
import { config } from '../config';
// import { log } from '../utils/logger';
import fs from 'fs';
import path from 'path';

/**
 * Manual login script.
 * Opens a visible browser window so the human can:
 * 1. Enter credentials
 * 2. Solve captcha
 * 3. Complete login
 *
 * Once logged in, the session is saved automatically.
 *
 * Usage:
 *   npx ts-node src/browser/manualLogin.ts niid
 *   npx ts-node src/browser/manualLogin.ts ag
 */

async function manualLogin() {
  const site = process.argv[2] as 'ag' | 'niid';

  if (!site || !['ag', 'niid'].includes(site)) {
    console.log('Usage: npx ts-node src/browser/manualLogin.ts <ag|niid>');
    process.exit(1);
  }

  const siteConfig = site === 'ag' ? config.ag : config.niid;
  const sessionPath = siteConfig.sessionPath;

  console.log(`\n🔐 Manual Login — ${site.toUpperCase()}`);
  console.log(`📍 URL: ${siteConfig.url}`);
  console.log(`📂 Session will be saved to: ${sessionPath}\n`);

  // Launch visible browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to login page
  await page.goto(siteConfig.url);

  // Pre-fill username and password if available
  if (siteConfig.username && siteConfig.password) {
    console.log('⌨️  Pre-filling credentials...');
    try {
      // Try common selector patterns - adjust as needed
      const usernameSelectors = ['internal:role=textbox[name="Username"i]', '#email', 'input[name="username"]', 'input[name="email"]', 'input[type="email"]'];
      const passwordSelectors = ['internal:role=textbox[name="Password"i]', '#password', 'input[name="password"]', 'input[type="password"]'];

      for (const sel of usernameSelectors) {
        try {
          const el = await page.$(sel);
          if (el) { await el.fill(siteConfig.username); break; }
        } catch {}
      }

      for (const sel of passwordSelectors) {
        try {
          const el = await page.$(sel);
          if (el) { await el.fill(siteConfig.password); break; }
        } catch {}
      }
    } catch {
      console.log('Could not pre-fill credentials. Please enter them manually.');
    }
  }

  console.log('👆 Please complete the login in the browser window.');
  if (site === 'niid') {
    console.log('🔒 Solve the CAPTCHA manually.');
  }
  console.log('⏳ Waiting for you to finish logging in...\n');

  // Wait for navigation away from login page
  // We'll wait up to 5 minutes for the human to login
  try {
    await page.waitForFunction(
      () => {
        // Check for common "logged in" indicators
        // This is a generic check — customize if needed
        const url = window.location.href;
        const hasLogout = document.querySelector('a[href*="logout"], button[class*="logout"], .logout');
        const hasDashboard = document.querySelector('.dashboard, #dashboard, [class*="dashboard"]');
        return hasLogout !== null || hasDashboard !== null;
      },
      { timeout: 300000 } // 5 minutes
    );
  } catch {
    // If the auto-detection fails, just ask the human
    console.log('\n⚡ Could not auto-detect login success.');
    console.log('Press ENTER in this terminal once you are fully logged in...');
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  // Save session
  const dir = path.dirname(sessionPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await context.storageState({ path: sessionPath });
  console.log(`\n✅ Session saved to ${sessionPath}`);
  console.log('You can now close this browser window.');
  console.log('The agent will reuse this session.\n');

  await browser.close();
  process.exit(0);
}

manualLogin().catch(err => {
  console.error('Login failed:', err);
  process.exit(1);
});
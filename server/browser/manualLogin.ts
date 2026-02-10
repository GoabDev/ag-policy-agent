import { chromium } from "playwright";
import { config } from "../config";
import { log, emitEvent } from "../utils/logger";
import fs from "fs";
import path from "path";
import { SiteName } from "../types";

// Track whether a manual login popup is already open
let loginInProgress = false;

/**
 * Opens a temporary headed browser for manual login (CAPTCHA, etc.).
 * The server's headless browser is unaffected — this spawns a separate
 * visible window, waits for the user to log in, saves the session, and closes.
 *
 * Returns true if login succeeded, false if it timed out or failed.
 */
export async function openLoginPopup(site: SiteName): Promise<boolean> {
  if (loginInProgress) {
    log(`Manual login popup already open, skipping duplicate request`, "warn");
    return false;
  }

  loginInProgress = true;
  const siteConfig = site === "ag" ? config.ag : config.niid;
  const sessionPath = siteConfig.sessionPath;

  log(`Opening manual login popup for ${site.toUpperCase()}...`);
  emitEvent("session:login_required", {
    site,
    message:
      "Manual login window opened — please complete login in the browser popup.",
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: 'chrome' });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(siteConfig.url);

    // Pre-fill credentials if available
    if (siteConfig.username && siteConfig.password) {
      try {
        const usernameSelectors = [
          "#ctl00_MainContent_txtUsername",
          'internal:role=textbox[name="Username"i]',
          "#email",
          'input[name="username"]',
          'input[name="email"]',
          'input[type="email"]',
        ];
        const passwordSelectors = [
          "#ctl00_MainContent_txtPassword",
          'internal:role=textbox[name="Password"i]',
          "#password",
          'input[name="password"]',
          'input[type="password"]',
        ];

        for (const sel of usernameSelectors) {
          try {
            const el = await page.$(sel);
            if (el) {
              await el.fill(siteConfig.username);
              break;
            }
          } catch {}
        }

        for (const sel of passwordSelectors) {
          try {
            const el = await page.$(sel);
            if (el) {
              await el.fill(siteConfig.password);
              break;
            }
          } catch {}
        }
      } catch {
        log("Could not pre-fill credentials", "warn");
      }
    }

    // Wait up to 5 minutes for the user to complete login
    try {
      await page.waitForFunction(
        () => {
          const hasLogout = document.querySelector(
            'internal:role=button[name="Logout"i]',
          );
          const hasDashboard = document.querySelector(
            'internal:role=cell[name="Home My Account Logout Help"i]',
          );
          return hasLogout !== null || hasDashboard !== null;
        },
        { timeout: 300000 },
      );
    } catch {
      // Auto-detection failed — wait for the page to navigate away from login
      log("Auto-detect failed, waiting for URL change as fallback...", "warn");
      try {
        await page.waitForURL("https://niid.org/App_Messages/Home.aspx", {
          timeout: 300000,
        });
      } catch {
        log("Manual login timed out", "error");
        emitEvent("session:login_failed", { site, reason: "timeout" });
        return false;
      }
    }

    // Save session
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await context.storageState({ path: sessionPath });
    log(`Manual login successful — session saved for ${site.toUpperCase()}`);
    emitEvent("session:status", {
      site,
      isActive: true,
      lastActivity: new Date().toISOString(),
    });

    await browser.close();
    return true;
  } catch (err: any) {
    log(`Manual login failed: ${err.message}`, "error");
    emitEvent("session:login_failed", { site, reason: err.message });
    if (browser) await browser.close().catch(() => {});
    return false;
  } finally {
    loginInProgress = false;
  }
}

/**
 * CLI entry point — run directly with:
 *   npx ts-node src/browser/manualLogin.ts <ag|niid>
 */
if (require.main === module) {
  const site = process.argv[2] as SiteName;

  if (!site || !["ag", "niid"].includes(site)) {
    console.log("Usage: npx ts-node src/browser/manualLogin.ts <ag|niid>");
    process.exit(1);
  }

  openLoginPopup(site).then((success) => {
    if (success) {
      console.log(`\nLogin complete. The agent will reuse this session.\n`);
    } else {
      console.error("\nLogin failed or timed out.\n");
    }
    process.exit(success ? 0 : 1);
  });
}

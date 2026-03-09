import { chromium } from "playwright";
import { config } from "../config";
import { log, emitEvent } from "../utils/logger";
import fs from "fs";
import path from "path";
import { SiteName } from "../types";
import { markSessionActive } from "./controller";

const loginsInProgress: Set<SiteName> = new Set();

export async function openLoginPopup(site: SiteName): Promise<boolean> {
  if (loginsInProgress.has(site)) {
    log(
      `Manual login popup already open for ${site.toUpperCase()}, skipping duplicate`,
      "warn",
    );
    return false;
  }

  loginsInProgress.add(site);
  const siteConfig =
    site === "ag" || site === "ag_push"
      ? config.ag
      : site === "niid_push"
        ? config.niidPush
        : config.niid;
  const sessionPath = siteConfig.sessionPath;

  log(`Opening manual login popup for ${site.toUpperCase()}...`);
  emitEvent("session:login_required", {
    site,
    message: "Manual login window opened - please complete login in the browser popup.",
  });

  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: "chrome" });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(siteConfig.url);

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

    try {
      await page.waitForFunction(
        () => {
          const url = window.location.href.toLowerCase();
          return (
            url.includes("home.aspx") ||
            url.includes("change_request.aspx") ||
            url.includes("upload_policy.aspx")
          );
        },
        { timeout: 300000 },
      );
    } catch {
      log("Auto-detect failed, waiting for URL change as fallback...", "warn");
      try {
        await page.waitForURL(
          (url) => {
            const value = url.toString().toLowerCase();
            return (
              value.includes("home.aspx") ||
              value.includes("change_request.aspx") ||
              value.includes("upload_policy.aspx")
            );
          },
          { timeout: 300000 },
        );
      } catch {
        log("Manual login timed out", "error");
        emitEvent("session:login_failed", {
          site,
          message: `${site.toUpperCase()} login timed out. Please try again.`,
        });
        return false;
      }
    }

    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await context.storageState({ path: sessionPath });
    markSessionActive(site);
    log(`Manual login successful - session saved for ${site.toUpperCase()}`);

    await browser.close();
    return true;
  } catch (err: any) {
    log(`Manual login failed: ${err.message}`, "error");
    emitEvent("session:login_failed", {
      site,
      message: `${site.toUpperCase()} login failed: ${err.message}`,
    });
    if (browser) await browser.close().catch(() => {});
    return false;
  } finally {
    loginsInProgress.delete(site);
  }
}

if (require.main === module) {
  const site = process.argv[2] as SiteName;

  if (!site || !["ag", "ag_push", "niid", "niid_push"].includes(site)) {
    console.log("Usage: npx ts-node src/browser/manualLogin.ts <ag|ag_push|niid|niid_push>");
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

import { Page } from "playwright";
import { config } from "../config";
import {
  getPage,
  saveSession,
  touchSession,
  getSessionStatus,
  clearSession,
} from "./controller";
import { loginToAG } from "./actions/ag";
import { openLoginPopup } from "./manualLogin";
import { log, emitEvent } from "../utils/logger";
import { SiteName } from "../types";

let heartbeatTimers: Map<SiteName, NodeJS.Timeout> = new Map();

// Pages we stay parked on — where the automation work happens
const PARK_PAGES: Record<SiteName, string> = {
  ag: "https://aginsuranceapplications.com/card/Policy/Policy_Update.aspx",
  niid: "https://niid.org/App_ADM_Module/Change_Request.aspx",
  niid_push: "https://niid.org/App_POL_Module/Upload_Policy.aspx",
};

// URLs that indicate expired sessions
const SESSION_EXPIRED_INDICATORS: Record<SiteName, string> = {
  ag: "ErrorPage.aspx", // Redirects to ErrorPage.aspx?Error=Sorry%20Your%20Session%20has%20Expired
  niid: "/default.aspx", // Redirects back to login page
  niid_push: "/default.aspx", // Same login redirect as niid
};

// ============================================
// Session expiry detection & recovery
// ============================================

function isSessionExpired(site: SiteName, url: string): boolean {
  return url.includes(SESSION_EXPIRED_INDICATORS[site]);
}

async function handleExpiredSession(site: SiteName, page: Page) {
  if (site === "ag") {
    log(`Session expired for AG, attempting re-login...`, "warn");
    await loginToAG();
    await page.goto(PARK_PAGES.ag, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await saveSession("ag");
    touchSession("ag");
    log(`AG session recovered — back on park page`);
    emitEvent("keepalive:ping", { site: "ag", status: "recovered" });
  } else if (site === "niid" || site === "niid_push") {
    const label = site === "niid_push" ? "NIID Push" : "NIID";
    log(
      `Session expired for ${label} — opening manual login popup (CAPTCHA)`,
      "warn",
    );
    stopHeartbeat(site);
    emitEvent("session:status", {
      site,
      isActive: false,
      reason: "session_expired",
    });

    // Clear stale session so the server picks up the fresh one after login
    await clearSession(site);

    // Spawn a headed popup for the user to log in
    const success = await openLoginPopup(site);
    if (success) {
      log(`${label} session restored via manual login, restarting heartbeat`);
      startHeartbeat(site);
    } else {
      log(`${label} manual login failed or timed out`, "error");
    }
  }
}

// ============================================
// Heartbeat: Keeps sessions alive
// ============================================x

async function sendHeartbeat(site: SiteName) {
  const status = getSessionStatus(site);

  if (!status.isActive) {
    log(
      `Skipping heartbeat for ${site.toUpperCase()} — no active session`,
      "warn",
    );
    return;
  }

  try {
    const page = await getPage(site);
    const targetUrl = PARK_PAGES[site];
    const currentUrl = page.url();
    const targetOrigin = new URL(targetUrl).origin;

    // If the page isn't on the target domain yet (e.g. about:blank on first run),
    // we need a full navigation to park there before lightweight fetches will work
    const isOnSite = currentUrl.startsWith(targetOrigin);

    if (!isOnSite) {
      log(
        `Page not on ${site.toUpperCase()} domain (at ${currentUrl}), navigating to park page...`,
      );
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Check if navigation got redirected to an expiry page
      const landedUrl = page.url();
      if (isSessionExpired(site, landedUrl)) {
        await handleExpiredSession(site, page);
        return;
      }
    } else {
      // Already on the site — check if we're stuck on an expiry page
      if (isSessionExpired(site, currentUrl)) {
        await handleExpiredSession(site, page);
        return;
      }

      // Lightweight fetch to keep session alive
      // fetch() follows redirects, so we check the final URL it landed on
      const response = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: "include" });
        return { ok: res.ok, status: res.status, url: res.url };
      }, targetUrl);

      if (isSessionExpired(site, response.url)) {
        await handleExpiredSession(site, page);
        return;
      }
    }

    await saveSession(site);
    touchSession(site);

    log(`Heartbeat OK — ${site.toUpperCase()}`);
    emitEvent("keepalive:ping", { site, status: "ok" });
  } catch (err: any) {
    log(`Heartbeat FAILED — ${site.toUpperCase()}: ${err.message}`, "error");
    emitEvent("keepalive:ping", { site, status: "failed", error: err.message });
  }
}

// ============================================
// Start / Stop Heartbeats
// ============================================

export function startHeartbeat(site: SiteName) {
  // Stop existing heartbeat if any
  stopHeartbeat(site);

  const interval = (site === "niid" || site === "niid_push") ? config.niidKeepAliveInterval : config.keepAliveInterval;

  log(
    `Starting heartbeat for ${site.toUpperCase()} (every ${interval / 60000} min)`,
  );

  // Send first heartbeat immediately
  sendHeartbeat(site);

  // Then on interval
  const timer = setInterval(
    () => sendHeartbeat(site),
    interval,
  );
  heartbeatTimers.set(site, timer);
}

export function stopHeartbeat(site: SiteName) {
  const timer = heartbeatTimers.get(site);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(site);
    log(`Stopped heartbeat for ${site.toUpperCase()}`);
  }
}

export function startAllHeartbeats() {
  const agStatus = getSessionStatus("ag");
  const niidStatus = getSessionStatus("niid");
  const niidPushStatus = getSessionStatus("niid_push");

  if (agStatus.isActive) startHeartbeat("ag");
  if (niidStatus.isActive) startHeartbeat("niid");
  if (niidPushStatus.isActive) startHeartbeat("niid_push");
}

export function stopAllHeartbeats() {
  stopHeartbeat("ag");
  stopHeartbeat("niid");
  stopHeartbeat("niid_push");
}

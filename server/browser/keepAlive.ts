import { Page } from "playwright";
import { config } from "../config";
import {
  getPage,
  saveSession,
  touchSession,
  getSessionStatus,
  clearSession,
  getLastWorkActivity,
} from "./controller";
import { loginToAG } from "./actions/ag";
import { openLoginPopup } from "./manualLogin";
import { log, emitEvent } from "../utils/logger";
import { SiteName } from "../types";

let heartbeatTimers: Map<SiteName, NodeJS.Timeout> = new Map();

// Kill sessions after this many ms of inactivity (default: 5 hours)
const SESSION_INACTIVITY_TIMEOUT = config.sessionInactivityTimeout;

// Pages we stay parked on — where the automation work happens
const PARK_PAGES: Record<SiteName, string> = {
  ag: "https://aginsuranceapplications.com/card/Policy/Policy_Update.aspx",
  niid: "https://niid.org/App_ADM_Module/Change_Request.aspx",
  ag_push:
    "https://aginsuranceapplications.com/card/Utility/Spool_Unpushed.aspx",
  niid_push: "https://niid.org/App_POL_Module/Upload_Policy.aspx",
};

// URLs that indicate expired sessions
const SESSION_EXPIRED_INDICATORS: Record<SiteName, string> = {
  ag: "ErrorPage.aspx", // Redirects to ErrorPage.aspx?Error=Sorry%20Your%20Session%20has%20Expired
  ag_push: "ErrorPage.aspx", // Redirects to ErrorPage.aspx?Error=Sorry%20Your%20Session%20has%20Expired
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

    // Re-navigate both AG pages to their park pages
    await page.goto(PARK_PAGES["ag"], {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const agPushPage = await getPage("ag_push");
    await agPushPage.goto(PARK_PAGES["ag_push"], {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await saveSession("ag");
    touchSession("ag");
    log(`AG session recovered — both pages back on park pages`);
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

async function sendHeartbeatForPage(site: SiteName) {
  const page = await getPage(site);
  const targetUrl = PARK_PAGES[site];
  const currentUrl = page.url();
  const targetOrigin = new URL(targetUrl).origin;

  const isOnSite = currentUrl.startsWith(targetOrigin);

  if (!isOnSite) {
    log(
      `Page not on ${site.toUpperCase()} domain (at ${currentUrl}), navigating to park page...`,
    );
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const landedUrl = page.url();
    if (isSessionExpired(site, landedUrl)) {
      return "expired";
    }
  } else {
    if (isSessionExpired(site, currentUrl)) {
      return "expired";
    }

    const response = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: "include" });
      return { ok: res.ok, status: res.status, url: res.url };
    }, targetUrl);

    if (isSessionExpired(site, response.url)) {
      return "expired";
    }
  }

  return "ok";
}

async function sendHeartbeat(site: SiteName) {
  const status = getSessionStatus(site);

  if (!status.isActive) {
    log(
      `Skipping heartbeat for ${site.toUpperCase()} — no active session`,
      "warn",
    );
    return;
  }

  // Auto-kill session after prolonged inactivity (based on last real work, not heartbeat pings)
  const lastWork = getLastWorkActivity(site) || status.lastActivity;
  if (lastWork) {
    const idleMs = Date.now() - new Date(lastWork).getTime();
    if (idleMs > SESSION_INACTIVITY_TIMEOUT) {
      const idleHours = (idleMs / 3600000).toFixed(1);
      log(
        `Session ${site.toUpperCase()} idle for ${idleHours}h — auto-killing to avoid unnecessary traffic`,
        "warn",
      );
      stopHeartbeat(site);
      await clearSession(site);
      emitEvent("session:status", {
        site,
        isActive: false,
        reason: "inactivity_timeout",
      });
      return;
    }
  }

  try {
    // For AG, heartbeat both the ag page and the ag_push page (shared session)
    const pagesToRefresh: SiteName[] = site === "ag" ? ["ag", "ag_push"] : [site];
    const page = await getPage(site);

    for (const pageSite of pagesToRefresh) {
      const result = await sendHeartbeatForPage(pageSite);
      if (result === "expired") {
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

  const interval =
    site === "niid" || site === "niid_push"
      ? config.niidKeepAliveInterval
      : config.keepAliveInterval; // ag & ag_push use the same interval

  log(
    `Starting heartbeat for ${site.toUpperCase()} (every ${interval / 60000} min)`,
  );

  // Send first heartbeat immediately
  sendHeartbeat(site);

  // Then on interval
  const timer = setInterval(() => sendHeartbeat(site), interval);
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

  if (agStatus.isActive) startHeartbeat("ag"); // AG heartbeat covers ag_push too
  if (niidStatus.isActive) startHeartbeat("niid");
  if (niidPushStatus.isActive) startHeartbeat("niid_push");
}

export function stopAllHeartbeats() {
  stopHeartbeat("ag"); // AG heartbeat covers ag_push too
  stopHeartbeat("niid");
  stopHeartbeat("niid_push");
}

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
const heartbeatInFlight: Map<SiteName, Promise<void>> = new Map();
const heartbeatFailureCounts: Map<SiteName, number> = new Map();
const MAX_HEARTBEAT_FAILURES = 3;

// Kill sessions after this many ms of inactivity (default: 5 hours)
const SESSION_INACTIVITY_TIMEOUT = config.sessionInactivityTimeout;

// Pages we stay parked on - where the automation work happens
const PARK_PAGES: Record<SiteName, string> = {
  ag: process.env.AG_POLICY_UPDATE_URL || "",
  niid: process.env.NIID_POLICY_CORRECTION_URL || "",
  ag_push: process.env.AG_POLICY_SPOOL_URL || "",
  niid_push: process.env.NIID_PUSH_URL || "",
};

// URLs that indicate expired sessions
const SESSION_EXPIRED_INDICATORS: Record<SiteName, string> = {
  ag: "ErrorPage.aspx",
  ag_push: "ErrorPage.aspx",
  niid: "/default.aspx",
  niid_push: "/default.aspx",
};

function isSessionExpired(site: SiteName, url: string): boolean {
  return url.includes(SESSION_EXPIRED_INDICATORS[site]);
}

async function handleExpiredSession(site: SiteName, page: Page) {
  if (site === "ag") {
    log(`Session expired for AG, attempting re-login...`, "warn");
    await loginToAG();

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
    heartbeatFailureCounts.set("ag", 0);
    log(`AG session recovered - both pages back on park pages`);
    emitEvent("keepalive:ping", { site: "ag", status: "recovered" });
  } else if (site === "niid" || site === "niid_push") {
    const label = site === "niid_push" ? "NIID Push" : "NIID";
    log(
      `Session expired for ${label} - opening manual login popup (CAPTCHA)`,
      "warn",
    );
    stopHeartbeat(site);
    emitEvent("session:status", {
      site,
      isActive: false,
      reason: "session_expired",
    });

    await clearSession(site);

    const success = await openLoginPopup(site);
    if (success) {
      log(`${label} session restored via manual login, restarting heartbeat`);
      startHeartbeat(site);
    } else {
      log(`${label} manual login failed or timed out`, "error");
      emitEvent("session:login_failed", {
        site,
        message: `${label} session expired and could not be restored. Please log in manually.`,
      });
    }
  }
}

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
      `Skipping heartbeat for ${site.toUpperCase()} - no active session`,
      "warn",
    );
    return;
  }

  const lastWork = getLastWorkActivity(site) || status.lastActivity;
  if (lastWork) {
    const idleMs = Date.now() - new Date(lastWork).getTime();
    if (idleMs > SESSION_INACTIVITY_TIMEOUT) {
      const idleHours = (idleMs / 3600000).toFixed(1);
      log(
        `Session ${site.toUpperCase()} idle for ${idleHours}h - auto-killing to avoid unnecessary traffic`,
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
    const pagesToRefresh: SiteName[] =
      site === "ag" ? ["ag", "ag_push"] : [site];
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
    heartbeatFailureCounts.set(site, 0);

    log(`Heartbeat OK - ${site.toUpperCase()}`);
    emitEvent("keepalive:ping", { site, status: "ok" });
  } catch (err: any) {
    const failures = (heartbeatFailureCounts.get(site) || 0) + 1;
    heartbeatFailureCounts.set(site, failures);

    log(`Heartbeat FAILED - ${site.toUpperCase()}: ${err.message}`, "error");
    emitEvent("keepalive:ping", {
      site,
      status: "failed",
      error: err.message,
    });

    if (failures >= MAX_HEARTBEAT_FAILURES) {
      const label =
        site === "ag"
          ? "A&G"
          : site === "ag_push"
            ? "A&G Push"
            : site === "niid_push"
              ? "NIID Push"
              : "NIID";

      log(
        `${label} session failed ${failures} consecutive heartbeat checks - clearing saved session`,
        "warn",
      );
      stopHeartbeat(site);
      await clearSession(site);
      heartbeatFailureCounts.set(site, 0);

      emitEvent("session:login_failed", {
        site,
        message: `${label} saved session could not be restored. Please log in manually.`,
      });
    }
  }
}

function runHeartbeatSafely(site: SiteName) {
  if (heartbeatInFlight.has(site)) {
    log(`Skipping overlapping heartbeat for ${site.toUpperCase()}`, "warn");
    return;
  }

  const run = sendHeartbeat(site)
    .catch((err: any) => {
      log(
        `Unhandled heartbeat failure for ${site.toUpperCase()}: ${err?.message || String(err)}`,
        "error",
      );
      emitEvent("keepalive:ping", {
        site,
        status: "failed",
        error: err?.message || String(err),
      });
    })
    .finally(() => {
      heartbeatInFlight.delete(site);
    });

  heartbeatInFlight.set(site, run);
}

export function startHeartbeat(site: SiteName) {
  stopHeartbeat(site);

  const interval =
    site === "niid" || site === "niid_push"
      ? config.niidKeepAliveInterval
      : config.keepAliveInterval;

  log(
    `Starting heartbeat for ${site.toUpperCase()} (every ${interval / 60000} min)`,
  );

  runHeartbeatSafely(site);

  const timer = setInterval(() => runHeartbeatSafely(site), interval);
  heartbeatTimers.set(site, timer);
}

export function stopHeartbeat(site: SiteName) {
  const timer = heartbeatTimers.get(site);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(site);
    log(`Stopped heartbeat for ${site.toUpperCase()}`);
  }
  heartbeatFailureCounts.set(site, 0);
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

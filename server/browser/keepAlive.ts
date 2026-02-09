import { config } from '../config';
import { getPage, saveSession, touchSession, getSessionStatus } from './controller';
import { log, emitEvent } from '../utils/logger';
import { SiteName } from '../types';

let heartbeatTimers: Map<SiteName, NodeJS.Timeout> = new Map();

// ============================================
// Heartbeat: Keeps sessions alive
// ============================================

async function sendHeartbeat(site: SiteName) {
  const siteConfig = site === 'ag' ? config.ag : config.niid;
  const status = getSessionStatus(site);

  if (!status.isActive) {
    log(`Skipping heartbeat for ${site.toUpperCase()} — no active session`, 'warn');
    return;
  }

  try {
    const page = await getPage(site);

    // Navigate to a lightweight page on the site to keep session alive
    // This simulates user activity without modifying anything
    await page.goto(siteConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Small delay to simulate human presence
    await page.waitForTimeout(2000);

    // Save refreshed session
    await saveSession(site);
    touchSession(site);

    log(`💓 Heartbeat OK — ${site.toUpperCase()}`);
    emitEvent('keepalive:ping', { site, status: 'ok' });
  } catch (err: any) {
    log(`💔 Heartbeat FAILED — ${site.toUpperCase()}: ${err.message}`, 'error');
    emitEvent('keepalive:ping', { site, status: 'failed', error: err.message });
  }
}

// ============================================
// Start / Stop Heartbeats
// ============================================

export function startHeartbeat(site: SiteName) {
  // Stop existing heartbeat if any
  stopHeartbeat(site);

  log(`Starting heartbeat for ${site.toUpperCase()} (every ${config.keepAliveInterval / 60000} min)`);

  // Send first heartbeat immediately
  sendHeartbeat(site);

  // Then on interval
  const timer = setInterval(() => sendHeartbeat(site), config.keepAliveInterval);
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
  const agStatus = getSessionStatus('ag');
  const niidStatus = getSessionStatus('niid');

  if (agStatus.isActive) startHeartbeat('ag');
  if (niidStatus.isActive) startHeartbeat('niid');
}

export function stopAllHeartbeats() {
  stopHeartbeat('ag');
  stopHeartbeat('niid');
}
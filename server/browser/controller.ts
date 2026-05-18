import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import { config } from '../config';
import { SiteName } from '../types';
import { log, emitEvent } from '../utils/logger';

// Shared browser instance
let browser: Browser | null = null;
let browserHeadless: boolean | null = null; // track the headless mode the browser was launched with

// Contexts per site (each site gets its own isolated context)
const contexts: Map<SiteName, BrowserContext> = new Map();
const pages: Map<SiteName, Page> = new Map();

// Track session status
const sessionStatus: Map<SiteName, { isActive: boolean; lastActivity: string }> = new Map();

// Track when real work (corrections/pushes) last happened — separate from heartbeat pings
const lastWorkActivity: Map<SiteName, string> = new Map();

// ============================================
// Browser Lifecycle
// ============================================

export async function launchBrowser(): Promise<Browser> {
  // If the headless setting changed since last launch, close and relaunch
  if (browser && browser.isConnected() && browserHeadless !== config.headless) {
    log(`Headless setting changed (${browserHeadless} → ${config.headless}), relaunching browser...`);
    await closeBrowser();
  }

  if (browser && browser.isConnected()) return browser;

  log('Launching browser...');
  browser = await chromium.launch({
    headless: config.headless,
    channel: 'chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  browserHeadless = config.headless;

  log(`Browser launched successfully (headless: ${config.headless})`);
  return browser;
}

export async function closeBrowser() {
  for (const [site, ctx] of contexts) {
    try { await ctx.close(); } catch {}
    contexts.delete(site);
    pages.delete(site);
  }
  if (browser) {
    await browser.close();
    browser = null;
    browserHeadless = null;
  }
  log('Browser closed');
}

export async function clearAllSessions() {
  const uniqueSessionPaths = new Set<string>([
    getSessionPath('ag'),
    getSessionPath('epin'),
    getSessionPath('niid'),
    getSessionPath('niip'),
    getSessionPath('niid_push'),
    getSessionPath('ag_auto_push'),
    getSessionPath('niid_auto_push'),
  ]);

  for (const sessionPath of uniqueSessionPaths) {
    try {
      if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    } catch (err: any) {
      log(`Failed to delete session file ${sessionPath}: ${err.message}`, 'warn');
    }
  }

  await closeBrowser();

  const now = new Date().toISOString();
  for (const site of ['ag', 'ag_status', 'ag_push', 'epin', 'niid', 'niip', 'niid_push', 'ag_auto_push', 'niid_auto_push'] as SiteName[]) {
    sessionStatus.set(site, { isActive: false, lastActivity: now });
    emitEvent('session:status', { site, isActive: false, lastActivity: now });
  }

  lastWorkActivity.clear();
  log('All sessions cleared');
}

// ============================================
// Session Management
// ============================================

function getSessionPath(site: SiteName): string {
  if (site === 'ag_auto_push') return config.automatedPush.agSessionPath;
  if (site === 'niid_auto_push') return config.automatedPush.niidSessionPath;
  if (site === 'ag' || site === 'ag_push' || site === 'ag_status') return config.ag.sessionPath;
  if (site === 'epin') return config.epin.sessionPath;
  if (site === 'niip') return config.niip.sessionPath;
  if (site === 'niid_push') return config.niidPush.sessionPath;
  return config.niid.sessionPath;
}

function hasStoredSession(site: SiteName): boolean {
  const sessionPath = getSessionPath(site);
  return fs.existsSync(sessionPath);
}

export async function getContext(site: SiteName): Promise<BrowserContext> {
  // AG shared pages use the same browser context (same session/cookies, different pages)
  const contextKey: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;

  // Return existing context if active
  const existing = contexts.get(contextKey);
  if (existing) return existing;

  const b = await launchBrowser();
  const sessionPath = getSessionPath(contextKey);

  let context: BrowserContext;

  // Try to load saved session
  if (hasStoredSession(contextKey)) {
    log(`Loading saved session for ${contextKey.toUpperCase()}`);
    try {
      context = await b.newContext({ storageState: sessionPath });
    } catch (err) {
      log(`Failed to load session for ${contextKey}, creating fresh context`, 'warn');
      context = await b.newContext();
    }
  } else {
    log(`No saved session for ${contextKey}, creating fresh context`);
    context = await b.newContext();
  }

  contexts.set(contextKey, context);
  return context;
}

export async function getPage(site: SiteName): Promise<Page> {
  const existing = pages.get(site);
  if (existing && !existing.isClosed()) return existing;

  const context = await getContext(site);
  const page = await context.newPage();
  pages.set(site, page);
  return page;
}

export async function saveSession(site: SiteName) {
  // AG shared pages use the same context
  const contextKey: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;
  const context = contexts.get(contextKey);
  if (!context) {
    log(`No active context for ${contextKey}, cannot save session`, 'warn');
    return;
  }

  const sessionPath = getSessionPath(contextKey);

  // Ensure storage directory exists
  const dir = require('path').dirname(sessionPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await context.storageState({ path: sessionPath });
  const now = new Date().toISOString();

  // Initialize work activity tracker if not set (e.g. on first login)
  if (!lastWorkActivity.has(contextKey)) {
    lastWorkActivity.set(contextKey, now);
  }

  // Update status for all AG shared pages when saving AG session
  sessionStatus.set(contextKey, { isActive: true, lastActivity: now });
  if (contextKey === 'ag') {
    sessionStatus.set('ag_status', { isActive: true, lastActivity: now });
    sessionStatus.set('ag_push', { isActive: true, lastActivity: now });
  }

  log(`Session saved for ${contextKey.toUpperCase()}`);
  emitEvent('session:status', { site: contextKey, isActive: true, lastActivity: now });
  if (contextKey === 'ag') {
    emitEvent('session:status', { site: 'ag_status', isActive: true, lastActivity: now });
    emitEvent('session:status', { site: 'ag_push', isActive: true, lastActivity: now });
  }
}

export async function clearSession(site: SiteName) {
  // AG shared pages use the same context
  const contextKey: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;
  const sessionPath = getSessionPath(contextKey);

  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
    log(`Session cleared for ${contextKey.toUpperCase()}`);
  }

  // Close existing context (and all AG shared pages if AG)
  const ctx = contexts.get(contextKey);
  if (ctx) {
    try { await ctx.close(); } catch {}
    contexts.delete(contextKey);
    pages.delete(contextKey);
    if (contextKey === 'ag') {
      pages.delete('ag_status');
      pages.delete('ag_push');
    }
  }

  const now = new Date().toISOString();
  sessionStatus.set(contextKey, { isActive: false, lastActivity: now });
  emitEvent('session:status', { site: contextKey, isActive: false });
  if (contextKey === 'ag') {
    sessionStatus.set('ag_status', { isActive: false, lastActivity: now });
    sessionStatus.set('ag_push', { isActive: false, lastActivity: now });
    emitEvent('session:status', { site: 'ag_status', isActive: false });
    emitEvent('session:status', { site: 'ag_push', isActive: false });
  }
}

export async function closeSessionRuntime(site: SiteName) {
  const contextKey: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;

  const ctx = contexts.get(contextKey);
  if (ctx) {
    try { await ctx.close(); } catch {}
    contexts.delete(contextKey);
  }

  pages.delete(contextKey);
  if (contextKey === 'ag') {
    pages.delete('ag_status');
    pages.delete('ag_push');
  }

  log(`Runtime browser context cleared for ${contextKey.toUpperCase()}`);
}

export function markSessionActive(site: SiteName) {
  const now = new Date().toISOString();
  const key: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;

  sessionStatus.set(key, { isActive: true, lastActivity: now });
  emitEvent('session:status', { site: key, isActive: true, lastActivity: now });

  if (key === 'ag') {
    sessionStatus.set('ag_status', { isActive: true, lastActivity: now });
    sessionStatus.set('ag_push', { isActive: true, lastActivity: now });
    emitEvent('session:status', { site: 'ag_status', isActive: true, lastActivity: now });
    emitEvent('session:status', { site: 'ag_push', isActive: true, lastActivity: now });
  }
}

export function getSessionStatus(site: SiteName) {
  // AG shared pages use the same session
  const lookupKey: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;
  return sessionStatus.get(lookupKey) || {
    isActive: hasStoredSession(lookupKey),
    lastActivity: hasStoredSession(lookupKey)
      ? fs.statSync(getSessionPath(lookupKey)).mtime.toISOString()
      : undefined,
  };
}

// ============================================
// Worker Context (isolated context for parallel corrections)
// ============================================

export async function createWorkerContext(site: SiteName): Promise<{ context: BrowserContext; page: Page }> {
  const b = await launchBrowser();
  const sessionPath = getSessionPath(site);

  let context: BrowserContext;

  if (hasStoredSession(site)) {
    try {
      context = await b.newContext({ storageState: sessionPath });
    } catch {
      context = await b.newContext();
    }
  } else {
    context = await b.newContext();
  }

  const page = await context.newPage();
  return { context, page };
}

// Update last activity timestamp (called by heartbeats and work)
export function touchSession(site: SiteName) {
  const now = new Date().toISOString();
  // AG shared pages use the same session
  const key: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;
  const current = sessionStatus.get(key);
  sessionStatus.set(key, { ...current, isActive: true, lastActivity: now });
}

// Mark that real user-initiated work happened (resets inactivity timer)
export function touchWorkActivity(site: SiteName) {
  const now = new Date().toISOString();
  const key: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;
  lastWorkActivity.set(key, now);
}

// Get last real work activity (for inactivity timeout checks)
export function getLastWorkActivity(site: SiteName): string | undefined {
  const key: SiteName = site === 'ag_push' || site === 'ag_status' ? 'ag' : site;
  return lastWorkActivity.get(key);
}

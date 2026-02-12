import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import { config } from '../config';
import { SiteName } from '../types';
import { log, emitEvent } from '../utils/logger';

// Shared browser instance
let browser: Browser | null = null;

// Contexts per site (each site gets its own isolated context)
const contexts: Map<SiteName, BrowserContext> = new Map();
const pages: Map<SiteName, Page> = new Map();

// Track session status
const sessionStatus: Map<SiteName, { isActive: boolean; lastActivity: string }> = new Map();

// ============================================
// Browser Lifecycle
// ============================================

export async function launchBrowser(): Promise<Browser> {
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

  log('Browser launched successfully');
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
  }
  log('Browser closed');
}

// ============================================
// Session Management
// ============================================

function getSessionPath(site: SiteName): string {
  if (site === 'ag') return config.ag.sessionPath;
  if (site === 'niid_push') return config.niidPush.sessionPath;
  return config.niid.sessionPath;
}

function hasStoredSession(site: SiteName): boolean {
  const sessionPath = getSessionPath(site);
  return fs.existsSync(sessionPath);
}

export async function getContext(site: SiteName): Promise<BrowserContext> {
  // Return existing context if active
  const existing = contexts.get(site);
  if (existing) return existing;

  const b = await launchBrowser();
  const sessionPath = getSessionPath(site);

  let context: BrowserContext;

  // Try to load saved session
  if (hasStoredSession(site)) {
    log(`Loading saved session for ${site.toUpperCase()}`);
    try {
      context = await b.newContext({ storageState: sessionPath });
    } catch (err) {
      log(`Failed to load session for ${site}, creating fresh context`, 'warn');
      context = await b.newContext();
    }
  } else {
    log(`No saved session for ${site}, creating fresh context`);
    context = await b.newContext();
  }

  contexts.set(site, context);
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
  const context = contexts.get(site);
  if (!context) {
    log(`No active context for ${site}, cannot save session`, 'warn');
    return;
  }

  const sessionPath = getSessionPath(site);

  // Ensure storage directory exists
  const dir = require('path').dirname(sessionPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await context.storageState({ path: sessionPath });
  const now = new Date().toISOString();
  sessionStatus.set(site, { isActive: true, lastActivity: now });

  log(`Session saved for ${site.toUpperCase()}`);
  emitEvent('session:status', { site, isActive: true, lastActivity: now });
}

export async function clearSession(site: SiteName) {
  const sessionPath = getSessionPath(site);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
    log(`Session cleared for ${site.toUpperCase()}`);
  }

  // Close existing context
  const ctx = contexts.get(site);
  if (ctx) {
    try { await ctx.close(); } catch {}
    contexts.delete(site);
    pages.delete(site);
  }

  sessionStatus.set(site, { isActive: false, lastActivity: new Date().toISOString() });
  emitEvent('session:status', { site, isActive: false });
}

export function getSessionStatus(site: SiteName) {
  return sessionStatus.get(site) || {
    isActive: hasStoredSession(site),
    lastActivity: hasStoredSession(site)
      ? fs.statSync(getSessionPath(site)).mtime.toISOString()
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

// Update last activity timestamp
export function touchSession(site: SiteName) {
  const now = new Date().toISOString();
  const current = sessionStatus.get(site);
  sessionStatus.set(site, { isActive: true, lastActivity: now, ...current });
}
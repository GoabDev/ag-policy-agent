import fs from "fs";
import path from "path";
import { config } from "./config";
import { closeBrowser } from "./browser/controller";
import { destroyAllWorkers } from "./browser/workerPool";
import { stopAllHeartbeats, startAllHeartbeats } from "./browser/keepAlive";
import { log } from "./utils/logger";
import { UserSettings } from "./types";
import {
  DEFAULT_NETWORK_TIMEOUT_MINUTES,
  NETWORK_TIMEOUT_OPTIONS_MINUTES,
} from "./browser/timeoutSettings";

const SETTINGS_FILE = path.join(config.storagePath, "settings.json");

const DEFAULT_SETTINGS: UserSettings = {
  headless: true,
  logRetentionDays: 30,
  autoStartSessions: false,
  networkTimeoutMinutes: DEFAULT_NETWORK_TIMEOUT_MINUTES,
  sessionTimeoutHours: 5,
  maxWorkers: 5,
  agKeepAliveMinutes: 5,
  niidKeepAliveMinutes: 2,
  notifications: "all",
};

let currentSettings: UserSettings = { ...DEFAULT_SETTINGS };

export function loadSettings(): UserSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
      const saved = JSON.parse(raw);
      currentSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
    }
  } catch {
    currentSettings = { ...DEFAULT_SETTINGS };
  }
  applyToConfig();
  return currentSettings;
}

export function getSettings(): UserSettings {
  return { ...currentSettings };
}

export function saveSettings(partial: Partial<UserSettings>): UserSettings {
  const oldHeadless = currentSettings.headless;
  currentSettings = normalizeSettings({ ...currentSettings, ...partial });

  // Ensure storage dir exists
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
  applyToConfig();

  // If headless mode changed, close the browser so it relaunches with the new setting.
  // getPage() caches pages and won't call launchBrowser() again otherwise.
  if (partial.headless !== undefined && partial.headless !== oldHeadless) {
    log(`Headless changed (${oldHeadless} → ${partial.headless}), restarting browser...`);
    stopAllHeartbeats();
    destroyAllWorkers()
      .then(() => closeBrowser())
      .then(() => {
        log(`Browser closed — will relaunch as headless=${partial.headless} on next use`);
        startAllHeartbeats();
      })
      .catch(() => {});
  }

  return currentSettings;
}

/** Push user settings into the live config object */
function applyToConfig(): void {
  config.headless = currentSettings.headless;
  config.maxWorkers = currentSettings.maxWorkers;
  config.networkTimeoutMs = currentSettings.networkTimeoutMinutes * 60 * 1000;
  config.sessionInactivityTimeout =
    currentSettings.sessionTimeoutHours * 60 * 60 * 1000;
  config.keepAliveInterval = currentSettings.agKeepAliveMinutes * 60 * 1000;
  config.niidKeepAliveInterval =
    currentSettings.niidKeepAliveMinutes * 60 * 1000;
}

function normalizeSettings(settings: UserSettings): UserSettings {
  const networkTimeoutMinutes = NETWORK_TIMEOUT_OPTIONS_MINUTES.some(
    (value) => value === settings.networkTimeoutMinutes,
  )
    ? settings.networkTimeoutMinutes
    : DEFAULT_NETWORK_TIMEOUT_MINUTES;

  return {
    ...settings,
    networkTimeoutMinutes,
  };
}

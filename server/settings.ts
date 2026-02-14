import fs from "fs";
import path from "path";
import { config } from "./config";
import { UserSettings } from "./types";

const SETTINGS_FILE = path.join(config.storagePath, "settings.json");

const DEFAULT_SETTINGS: UserSettings = {
  headless: true,
  logRetentionDays: 30,
  autoStartSessions: false,
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
      currentSettings = { ...DEFAULT_SETTINGS, ...saved };
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
  currentSettings = { ...currentSettings, ...partial };

  // Ensure storage dir exists
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
  applyToConfig();
  return currentSettings;
}

/** Push user settings into the live config object */
function applyToConfig(): void {
  config.headless = currentSettings.headless;
  config.maxWorkers = currentSettings.maxWorkers;
  config.sessionInactivityTimeout =
    currentSettings.sessionTimeoutHours * 60 * 60 * 1000;
  config.keepAliveInterval = currentSettings.agKeepAliveMinutes * 60 * 1000;
  config.niidKeepAliveInterval =
    currentSettings.niidKeepAliveMinutes * 60 * 1000;
}

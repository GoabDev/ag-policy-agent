import fs from "fs";
import path from "path";
import { config } from "../config";
import { getSettings } from "../settings";
import { log } from "../utils/logger";

/** Delete log files older than the configured retention period */
export function runLogCleanup(): { deleted: number; remaining: number } {
  const { logRetentionDays } = getSettings();
  const cutoff = Date.now() - logRetentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let remaining = 0;

  try {
    const files = fs.readdirSync(config.logsPath);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(config.logsPath, file);

      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deleted++;
        } else {
          remaining++;
        }
      } catch {
        // Skip files we can't stat/delete
      }
    }

    if (deleted > 0) {
      log(`Log cleanup: deleted ${deleted} files older than ${logRetentionDays} days`);
    }
  } catch {
    // Logs directory may not exist yet
  }

  return { deleted, remaining };
}

/** Count how many logs would be cleaned */
export function getCleanableLogCount(): { total: number; cleanable: number } {
  const { logRetentionDays } = getSettings();
  const cutoff = Date.now() - logRetentionDays * 24 * 60 * 60 * 1000;
  let total = 0;
  let cleanable = 0;

  try {
    const files = fs.readdirSync(config.logsPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      total++;
      const filePath = path.join(config.logsPath, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) cleanable++;
      } catch {}
    }
  } catch {}

  return { total, cleanable };
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/** Start the periodic log cleanup (runs every hour) */
export function startLogCleanup(): void {
  // Run once immediately
  runLogCleanup();

  // Then every hour
  cleanupInterval = setInterval(() => runLogCleanup(), 60 * 60 * 1000);
}

export function stopLogCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

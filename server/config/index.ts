import dotenv from "dotenv";
import path from "path";
import { Config } from "../types";

const isElectronProd = process.env.ELECTRON === "true" && !__dirname.includes("node_modules");

// In Electron production, __dirname is inside resources/server/dist/config/
// We need to go up to resources/ to find sibling directories.
// In dev (ts-node), __dirname is server/config/ and project root is ../../
function getResourceBase(): string {
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }
  if (isElectronProd) {
    return path.resolve(__dirname, "../../..");
  }
  return path.resolve(__dirname, "../..");
}

function getServerRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return path.join(process.env.PROJECT_ROOT, "server");
  }
  if (isElectronProd) {
    return path.resolve(__dirname, "../..");
  }
  return path.resolve(__dirname, "..");
}

const resourceBase = getResourceBase();
const serverRoot = getServerRoot();

dotenv.config({ path: path.join(serverRoot, ".env") });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return value;
}

// STORAGE_PATH is set by Electron main process to app.getPath("userData")/storage
// so files are written to an OS-standard writable location regardless of install path.
// Falls back to <projectRoot>/storage for dev mode or non-Electron usage.
const storagePath = process.env.STORAGE_PATH || path.join(resourceBase, "storage");

export const config: Config = Object.seal({
  // A&G Platform
  ag: {
    url: getEnv("AG_URL"),
    spoolUrl: getEnv("AG_SPOOL_URL", "https://aginsuranceapplications.com/card/Utility/Spool_Unpushed.aspx"),
    username: getEnv("AG_USERNAME"),
    password: getEnv("AG_PASSWORD"),
    sessionPath: path.join(storagePath, "ag-session.json"),
  },

  // NIID (corrections)
  niid: {
    url: getEnv("NIID_URL"),
    policyCorrectionUrl: getEnv("NIID_POLICY_CORRECTION_URL"),
    username: getEnv("NIID_USERNAME"),
    password: getEnv("NIID_PASSWORD"),
    sessionPath: path.join(storagePath, "niid-session.json"),
  },

  // NIID (policy push — separate session with alt credentials)
  niidPush: {
    url: getEnv("NIID_URL"),
    uploadUrl: getEnv("NIID_UPLOAD_URL", "https://niid.org/App_POL_Module/Upload_Policy.aspx"),
    username: getEnv("NIID_ALT_USERNAME"),
    password: getEnv("NIID_ALT_PASSWORD"),
    sessionPath: path.join(storagePath, "niid-push-session.json"),
  },

  // Server
  port: parseInt(getEnv("PORT", "3001"), 10) || 0,

  // Keep-alive interval in milliseconds
  keepAliveInterval:
    parseInt(getEnv("KEEPALIVE_INTERVAL", "5"), 10) * 60 * 1000,
  niidKeepAliveInterval:
    parseInt(getEnv("NIID_KEEPALIVE_INTERVAL", "2"), 10) * 60 * 1000,

  // Auto-kill sessions after inactivity (hours → ms, default: 5 hours)
  sessionInactivityTimeout:
    parseInt(getEnv("SESSION_INACTIVITY_HOURS", "5"), 10) * 60 * 60 * 1000,

  // Worker pool
  maxWorkers: parseInt(getEnv("MAX_WORKERS", "5"), 10),

  // Browser
  headless: getEnv("HEADLESS", "true") === "true",

  // Paths
  storagePath,
  logsPath: path.join(storagePath, "logs"),
  dashboardPath: path.join(resourceBase, "client/out"),
});

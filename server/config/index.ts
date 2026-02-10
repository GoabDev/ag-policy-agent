import dotenv from "dotenv";
import path from "path";
import { Config } from "../types";

const isElectronProd = process.env.ELECTRON === "true" && !__dirname.includes("node_modules");

// In Electron production, __dirname is inside resources/server/dist/config/
// We need to go up to resources/ to find sibling directories.
// In dev (ts-node), __dirname is server/config/ and project root is ../../
function getResourceBase(): string {
  if (isElectronProd) {
    // __dirname = .../resources/server/dist/config → go up 3 levels to resources/
    return path.resolve(__dirname, "../../..");
  }
  // Dev: __dirname = server/config → go up 2 levels to project root
  return path.resolve(__dirname, "../..");
}

function getServerRoot(): string {
  if (isElectronProd) {
    // __dirname = .../resources/server/dist/config → go up 2 levels to server/
    return path.resolve(__dirname, "../..");
  }
  // Dev: __dirname = server/config → go up 1 level to server/
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

export const config: Config = {
  // A&G Platform
  ag: {
    url: getEnv("AG_URL"),
    username: getEnv("AG_USERNAME"),
    password: getEnv("AG_PASSWORD"),
    sessionPath: path.join(resourceBase, "storage/ag-session.json"),
  },

  // NIID
  niid: {
    url: getEnv("NIID_URL"),
    policyCorrectionUrl: getEnv("NIID_POLICY_CORRECTION_URL"),
    username: getEnv("NIID_USERNAME"),
    password: getEnv("NIID_PASSWORD"),
    sessionPath: path.join(resourceBase, "storage/niid-session.json"),
  },

  // Server
  port: parseInt(getEnv("PORT", "3001"), 10) || 0,

  // Keep-alive interval in milliseconds
  keepAliveInterval:
    parseInt(getEnv("KEEPALIVE_INTERVAL", "5"), 10) * 60 * 1000,
  niidKeepAliveInterval:
    parseInt(getEnv("NIID_KEEPALIVE_INTERVAL", "2"), 10) * 60 * 1000,

  // Worker pool
  maxWorkers: parseInt(getEnv("MAX_WORKERS", "5"), 10),

  // Browser
  headless: getEnv("HEADLESS", "true") === "true",

  // Paths
  storagePath: path.join(resourceBase, "storage"),
  logsPath: path.join(resourceBase, "storage/logs"),
  dashboardPath: path.join(resourceBase, "client/out"),
};

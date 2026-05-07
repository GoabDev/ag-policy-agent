import { config } from "../config";

export const NETWORK_TIMEOUT_OPTIONS_MINUTES = [1, 2, 5, 10, 15] as const;
export const DEFAULT_NETWORK_TIMEOUT_MINUTES = 2;
export const QUICK_CHECK_TIMEOUT_MS = 5_000;

export function getNetworkTimeoutMs(): number {
  return config.networkTimeoutMs;
}

export function getQuickCheckTimeoutMs(): number {
  return Math.min(QUICK_CHECK_TIMEOUT_MS, getNetworkTimeoutMs());
}

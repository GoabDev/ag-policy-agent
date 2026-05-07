import { getNetworkTimeoutMs } from "./timeoutSettings";

export function getNIIPLoginTimeoutMs(): number {
  return getNetworkTimeoutMs();
}

export function getNIIPNavigationTimeoutMs(): number {
  return getNetworkTimeoutMs();
}

export function getNIIPSuccessTimeoutMs(): number {
  return getNetworkTimeoutMs();
}

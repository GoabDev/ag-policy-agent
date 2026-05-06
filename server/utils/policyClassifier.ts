export type PolicyChannel = "scratch_card" | "epin";

function getLastSegment(policyNumber: string): string {
  const segments = policyNumber
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments[segments.length - 1] || "";
}

export function isEpinPolicyNumber(policyNumber: string): boolean {
  return /^C\d+$/i.test(getLastSegment(policyNumber));
}

export function getPolicyChannel(policyNumber: string): PolicyChannel {
  return isEpinPolicyNumber(policyNumber) ? "epin" : "scratch_card";
}

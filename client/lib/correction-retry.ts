const RETRY_DRAFT_STORAGE_KEY = "ag-policy-agent:correction-retry-draft";

export type CorrectionRetryDraft = {
  correction: Record<string, any>;
  token: number;
};

export function buildCorrectionRetryValues(correction?: Record<string, any>) {
  const safeCorrection = correction || {};

  return {
    type: safeCorrection.type || "registration",
    policyNumber: safeCorrection.policyNumber || "",
    newValue: safeCorrection.newRegistrationNumber || safeCorrection.newValue || "",
    firstName: safeCorrection.firstName || "",
    lastName: safeCorrection.lastName || "",
    email: safeCorrection.email || "",
    phone: safeCorrection.phone || "",
    engineNumber: safeCorrection.engineNumber || "",
    newChassisNumber: safeCorrection.newChassisNumber || "",
    newRegistrationNumber: safeCorrection.newRegistrationNumber || "",
    vehicleColor: safeCorrection.vehicleColor || "",
    newVehicleMake: safeCorrection.newVehicleMake || "",
    newVehicleModel: safeCorrection.newVehicleModel || "",
    vehicleYear: safeCorrection.vehicleYear || "",
    address: safeCorrection.address || "",
    portalTarget: safeCorrection.portalTarget || "auto",
    previousRegistrationNumber: safeCorrection.previousRegistrationNumber || "",
  };
}

export function createCorrectionRetryDraft(correction: Record<string, any>): CorrectionRetryDraft {
  return {
    correction,
    token: Date.now(),
  };
}

export function saveCorrectionRetryDraft(correction: Record<string, any>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    RETRY_DRAFT_STORAGE_KEY,
    JSON.stringify(createCorrectionRetryDraft(correction)),
  );
}

export function takeCorrectionRetryDraft(): CorrectionRetryDraft | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(RETRY_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  window.sessionStorage.removeItem(RETRY_DRAFT_STORAGE_KEY);

  try {
    return JSON.parse(raw) as CorrectionRetryDraft;
  } catch {
    return null;
  }
}

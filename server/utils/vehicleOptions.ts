export const VEHICLE_COLOR_OPTIONS = [
  "Ash",
  "Black",
  "Blue",
  "Brown",
  "Commercial",
  "Corporate",
  "Cream",
  "Customized",
  "Gold",
  "Green",
  "Grey",
  "Indigo",
  "Orange",
  "Pink",
  "Purple",
  "Red",
  "Silver",
  "Violet",
  "White",
  "Wine",
  "Yellow",
  "Other",
] as const;

export function normalizeVehicleColor(color: string): string {
  const trimmed = color.trim().toLowerCase();
  const match = VEHICLE_COLOR_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed,
  );

  if (!match) {
    throw new Error(
      `Unsupported vehicle color "${color}". Allowed values: ${VEHICLE_COLOR_OPTIONS.join(", ")}`,
    );
  }

  return match;
}

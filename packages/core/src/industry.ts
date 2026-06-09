/**
 * Industry normalization.
 *
 * Source rows carry both an `Industry` (broad) and `Vertical` (granular) column.
 * `Vertical` is the cleaner signal for rotation-bucket mapping — `Industry` mixes
 * unrelated things (e.g. "Energy & Resources" covers both Oil & Gas and Mining).
 *
 * Buckets: monday=utilities, tuesday=oil_and_gas, wednesday=distribution_transportation,
 * thursday=manufacturing, friday=financial_services. Anything else → 'other'
 * (account is kept, status='out_of_rotation', not surfaced).
 */

export type RotationBucket =
  | "utilities"
  | "oil_and_gas"
  | "distribution_transportation"
  | "manufacturing"
  | "financial_services"
  | "other";

// Keyed on the raw Vertical value from the source spreadsheet.
// Edit this map to change rotation membership.
export const VERTICAL_TO_BUCKET: Record<string, RotationBucket> = {
  // utilities
  "Power & Utilities": "utilities",
  "Water & Sewage": "utilities",

  // oil & gas
  "Oil & Gas": "oil_and_gas",
  // NOTE: Mining is intentionally NOT mapped to oil_and_gas by default.
  // Flip to "oil_and_gas" if you want mining accounts in the Tuesday rotation.
  // "Mining": "oil_and_gas",

  // distribution & transportation
  "Transport & Travel": "distribution_transportation",

  // manufacturing
  "Discrete Manufacturing": "manufacturing",
  "Process Manufacturing": "manufacturing",

  // financial services
  "Banking": "financial_services",
  "Insurance": "financial_services",
  "Capital Markets": "financial_services",
};

export function normalizeIndustry(vertical: string | null | undefined): RotationBucket {
  if (!vertical) return "other";
  return VERTICAL_TO_BUCKET[vertical.trim()] ?? "other";
}

export const BUCKET_TO_WEEKDAY: Record<Exclude<RotationBucket, "other">, string> = {
  utilities: "monday",
  oil_and_gas: "tuesday",
  distribution_transportation: "wednesday",
  manufacturing: "thursday",
  financial_services: "friday",
};

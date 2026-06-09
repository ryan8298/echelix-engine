/**
 * DB-driven engine configuration.
 *
 * All callers fetch via `loadConfig(client)` and pass through the relevant
 * slice to pure functions (industry.ts, scoring.ts, etc.). This keeps the
 * pure functions testable + side-effect free, with one I/O boundary here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RotationConfig = Record<
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday",
  string | null
>;
export type IndustryMap = Record<string, string>;
/** @deprecated Renamed to IndustryMap — keep the alias until callers migrate. */
export type VerticalMap = IndustryMap;
export type RevenueBand = {
  lower_usd: number;
  upper_usd: number;
  tiebreaker_pct: number;
};
export type ScoringWeights = {
  freshness: number;
  relevance: number;
  triggers: number;
  ms_fit: number;
  anti_repeat: number;
};
export type QualityFloor = {
  min_freshness: number;
  min_relevance: number;
};

export type EngineConfig = {
  rotation: RotationConfig;
  industry_map: IndustryMap;
  revenue_band: RevenueBand;
  scoring_weights: ScoringWeights;
  quality_floor: QualityFloor;
  cooldown_days: number;
};

export const DEFAULT_CONFIG: EngineConfig = {
  rotation: {
    monday: "utilities",
    tuesday: "oil_and_gas",
    wednesday: "distribution_transportation",
    thursday: "manufacturing",
    friday: "financial_services",
  },
  industry_map: {
    "Oil & Gas": "oil_and_gas",
    "Energy & Resources": "oil_and_gas",
    "Mining": "oil_and_gas",
    "Power & Utilities": "utilities",
    "Water & Sewage": "utilities",
    "Transport & Travel": "distribution_transportation",
    "Automotive": "distribution_transportation",
    "Automotive, Mobility, Transpt": "distribution_transportation",
    "Discrete Manufacturing": "manufacturing",
    "Industrials & Manufacturing": "manufacturing",
    "Process Manufacturing": "manufacturing",
    "Banking": "financial_services",
    "Capital Markets": "financial_services",
    "Insurance": "financial_services",
    "Financial Services": "financial_services",
  },
  revenue_band: { lower_usd: 500_000_000, upper_usd: 5_000_000_000, tiebreaker_pct: 0.1 },
  scoring_weights: { freshness: 30, relevance: 25, triggers: 20, ms_fit: 15, anti_repeat: 10 },
  quality_floor: { min_freshness: 0.4, min_relevance: 0.3 },
  cooldown_days: 30,
};

export async function loadConfig(sb: SupabaseClient): Promise<EngineConfig> {
  const { data, error } = await sb.from("engine_config").select("key, value");
  if (error) {
    console.warn("[config] failed to load, using defaults:", error.message);
    return DEFAULT_CONFIG;
  }
  const map = new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  // Accept both 'industry_map' (current) and legacy 'vertical_map' for back-compat.
  const industryMap = (map.get("industry_map") as IndustryMap | undefined)
    ?? (map.get("vertical_map") as IndustryMap | undefined)
    ?? DEFAULT_CONFIG.industry_map;
  return {
    rotation:        (map.get("rotation")        as RotationConfig)   ?? DEFAULT_CONFIG.rotation,
    industry_map:    industryMap,
    revenue_band:    (map.get("revenue_band")    as RevenueBand)      ?? DEFAULT_CONFIG.revenue_band,
    scoring_weights: (map.get("scoring_weights") as ScoringWeights)   ?? DEFAULT_CONFIG.scoring_weights,
    quality_floor:   (map.get("quality_floor")   as QualityFloor)     ?? DEFAULT_CONFIG.quality_floor,
    cooldown_days:   (map.get("cooldown_days")   as number)           ?? DEFAULT_CONFIG.cooldown_days,
  };
}

/** Today's industry from a rotation map. Calendar-driven, not skip-aware. */
export function industryForDate(d: Date, rotation: RotationConfig): string | null {
  switch (d.getDay()) {
    case 1: return rotation.monday;
    case 2: return rotation.tuesday;
    case 3: return rotation.wednesday;
    case 4: return rotation.thursday;
    case 5: return rotation.friday;
    default: return null;
  }
}

/** Vertical → bucket lookup with 'other' fallback. */
export function normalizeIndustryFromMap(vertical: string | null | undefined, map: VerticalMap): string {
  if (!vertical) return "other";
  return map[vertical.trim()] ?? "other";
}

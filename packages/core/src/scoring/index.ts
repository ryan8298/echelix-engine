/**
 * Loop 2 scoring + selection.
 *
 * Per blueprint §6 with the user's added minimum-signal-quality floor.
 *
 * Five components (sum to 100):
 *   - freshness (30) — how recent is the newest signal
 *   - relevance (25) — count of motion-aligned tags
 *   - triggers  (20) — leadership / M&A / capex events in last 90d
 *   - ms_fit    (15) — recent Microsoft/Azure signals + presence of MS team
 *   - anti_repeat (10) — penalty for recent last_surfaced_date
 *
 * Quality floor (user rule): an account must clear freshness >= 0.4
 * AND relevance >= 0.3 to be eligible for selection. If fewer than 5
 * accounts clear, surface fewer + flag the shortfall — don't pad.
 *
 * Cooldown (user-approved): hard 30-day floor on last_surfaced_date.
 */

export const WEIGHTS = {
  freshness: 30,
  relevance: 25,
  triggers: 20,
  ms_fit: 15,
  anti_repeat: 10,
} as const;

export const QUALITY_FLOOR = {
  min_freshness: 0.4,    // newest signal within ~60 days
  min_relevance: 0.3,    // ~2 motion-aligned tags total
} as const;

export const COOLDOWN_DAYS = 30;

export type SignalInput = {
  signal_type: string;
  signal_date: string | null;     // YYYY-MM-DD
  relevance_tags: string[];
};

export type ScoreInputs = {
  signals: SignalInput[];
  microsoft_team: Record<string, unknown> | null;
  last_surfaced_date: string | null;  // YYYY-MM-DD
  now?: Date;                          // injectable for testing
};

export type ScoreBreakdown = {
  freshness: number;       // 0..1
  relevance: number;       // 0..1
  triggers: number;        // 0..1
  ms_fit: number;          // 0..1
  anti_repeat: number;     // 0..1
  total: number;           // 0..100
  eligible: boolean;       // passed quality floor + cooldown
  reason_ineligible: string | null;
};

const MOTION_TAGS = new Set([
  "microsoft",
  "azure",
  "hiring",
  "leadership",
  "capex",
  "ma",
  "integration",
  "greenfield",
  "earnings",
]);

const TRIGGER_PATTERNS: Array<{ tag: string; weight: number; max_age_days: number }> = [
  { tag: "leadership", weight: 0.4, max_age_days: 90 },
  { tag: "ma",         weight: 0.3, max_age_days: 90 },
  { tag: "capex",      weight: 0.3, max_age_days: 90 },
  { tag: "hiring",     weight: 0.15, max_age_days: 60 },
  { tag: "greenfield", weight: 0.2, max_age_days: 180 },
];

function daysSince(dateStr: string | null, now: Date): number {
  if (!dateStr) return Infinity;
  return (now.getTime() - new Date(dateStr).getTime()) / 86_400_000;
}

function freshnessScore(signals: SignalInput[], now: Date): number {
  let newest = Infinity;
  for (const s of signals) {
    const d = daysSince(s.signal_date, now);
    if (d < newest) newest = d;
  }
  if (newest <= 7)  return 1.0;
  if (newest <= 14) return 0.85;
  if (newest <= 30) return 0.65;
  if (newest <= 60) return 0.4;
  if (newest <= 90) return 0.2;
  return 0.05;
}

function relevanceScore(signals: SignalInput[]): number {
  let hits = 0;
  for (const s of signals) for (const t of s.relevance_tags) if (MOTION_TAGS.has(t)) hits++;
  // 0 hits → 0, 1 → 0.15, ..., 6+ → 1.0
  return Math.min(1.0, hits * 0.15);
}

function triggerScore(signals: SignalInput[], now: Date): number {
  let total = 0;
  const counted = new Set<string>();
  for (const s of signals) {
    const age = daysSince(s.signal_date, now);
    for (const t of s.relevance_tags) {
      const rule = TRIGGER_PATTERNS.find((r) => r.tag === t);
      if (!rule || age > rule.max_age_days) continue;
      // Only count each trigger type once per account.
      if (counted.has(t)) continue;
      counted.add(t);
      total += rule.weight;
    }
  }
  return Math.min(1.0, total);
}

function msFitScore(signals: SignalInput[], microsoft_team: Record<string, unknown> | null, now: Date): number {
  let recentMsSignals = 0;
  for (const s of signals) {
    const age = daysSince(s.signal_date, now);
    if (age > 180) continue;
    if (s.relevance_tags.includes("microsoft") || s.relevance_tags.includes("azure")) {
      recentMsSignals++;
    }
  }
  const newsComponent = Math.min(0.7, recentMsSignals * 0.35);
  const hasTeam = microsoft_team && typeof microsoft_team === "object" &&
    ("ae" in microsoft_team || "ats" in microsoft_team);
  const teamComponent = hasTeam ? 0.3 : 0;
  return Math.min(1.0, newsComponent + teamComponent);
}

function antiRepeatScore(last_surfaced_date: string | null, now: Date): number {
  if (!last_surfaced_date) return 1.0;
  const days = daysSince(last_surfaced_date, now);
  if (days >= 90) return 1.0;
  if (days >= 60) return 0.8;
  if (days >= 30) return 0.5;
  return 0.0; // inside cooldown — eligibility will be rejected separately
}

export function scoreAccount(inputs: ScoreInputs): ScoreBreakdown {
  const now = inputs.now ?? new Date();
  const freshness = freshnessScore(inputs.signals, now);
  const relevance = relevanceScore(inputs.signals);
  const triggers = triggerScore(inputs.signals, now);
  const ms_fit = msFitScore(inputs.signals, inputs.microsoft_team, now);
  const anti_repeat = antiRepeatScore(inputs.last_surfaced_date, now);

  const total =
    freshness * WEIGHTS.freshness +
    relevance * WEIGHTS.relevance +
    triggers * WEIGHTS.triggers +
    ms_fit * WEIGHTS.ms_fit +
    anti_repeat * WEIGHTS.anti_repeat;

  // Eligibility
  let eligible = true;
  let reason_ineligible: string | null = null;

  if (inputs.last_surfaced_date) {
    const d = daysSince(inputs.last_surfaced_date, now);
    if (d < COOLDOWN_DAYS) {
      eligible = false;
      reason_ineligible = `cooldown (surfaced ${Math.round(d)}d ago)`;
    }
  }
  if (eligible && freshness < QUALITY_FLOOR.min_freshness) {
    eligible = false;
    reason_ineligible = `freshness ${freshness.toFixed(2)} < ${QUALITY_FLOOR.min_freshness}`;
  }
  if (eligible && relevance < QUALITY_FLOOR.min_relevance) {
    eligible = false;
    reason_ineligible = `relevance ${relevance.toFixed(2)} < ${QUALITY_FLOOR.min_relevance}`;
  }

  return { freshness, relevance, triggers, ms_fit, anti_repeat, total, eligible, reason_ineligible };
}

/** Returns YYYY-MM-DD weekday → rotation industry mapping for selection date. */
export function industryForDate(d: Date): string | null {
  // Monday=1..Friday=5 in JS getDay (sun=0, sat=6)
  switch (d.getDay()) {
    case 1: return "utilities";
    case 2: return "oil_and_gas";
    case 3: return "distribution_transportation";
    case 4: return "manufacturing";
    case 5: return "financial_services";
    default: return null;
  }
}

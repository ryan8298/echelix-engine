/**
 * Azure Consumed Revenue (ACR) rate card.
 *
 * One file, one canonical set of numbers. Every brief built by this engine
 * pulls from here so the math is identical across briefs and provably
 * traceable when a Microsoft reviewer asks "where did this number come from."
 *
 * ALL FIGURES ARE ANNUAL USD (Year 1 contribution).
 *
 * Calibration: numbers grounded in Echelix's published briefs as of June 2026:
 *   - ConocoPhillips (LNG Commercial Ops, Megaproject Health, Marathon Synergy)
 *   - HF Sinclair (Refining Ops, Crude/Product Trading)
 *   - Occidental Petroleum
 *   - Watts Water
 * Each line item below cites the brief it was extracted from.
 *
 * Source: Azure Global Standard pricing as of June 2026, matched against
 * the per-line-item dollar amounts published in the briefs above.
 */

export const RATE_CARD_PINNED_TO = "Azure Global Standard pricing — June 2026";

/* -------------------------------------------------------------------------- *
 *  Foundry Models — GPT-5 + GPT-5-mini blended.
 *  Driver: monthly token volume (input + output, blended).
 *  Evidence from briefs (annual Y1 contribution):
 *    45M tok/mo → $1K–$2K   (CoP Marathon Synergy)
 *    50M tok/mo → $1K–$3K   (CoP LNG, HF crude trading)
 *    55M tok/mo → $1K–$3K   (HF Refining Ops)
 *    60M tok/mo → $2K–$4K   (CoP Megaproject Health)
 *  Modeled as: annual = tokens_M_per_mo × rate, with a low/high spread.
 * -------------------------------------------------------------------------- */
export const FOUNDRY_MODELS = {
  annual_low_per_million_tokens_per_mo:  35, // $/yr per (1M tokens/mo)
  annual_high_per_million_tokens_per_mo: 60,
  defaults_by_workload: {
    ot_real_time:          50_000_000,  // tokens/mo
    megaproject_synthesis: 60_000_000,
    m365_synthesis:        45_000_000,
    commercial_optimization: 50_000_000,
    generic:               50_000_000,
  },
} as const;

/* -------------------------------------------------------------------------- *
 *  Microsoft Fabric — capacity SKU (annual contribution).
 *  Evidence:
 *    F16 ~$16K/yr  (light)
 *    F32 ~$32K/yr  (M365/SharePoint-heavy)        — CoP Marathon Synergy
 *    F64 ~$63K/yr  (OT-heavy, real-time telemetry) — CoP LNG, HF Refining, etc.
 * -------------------------------------------------------------------------- */
export const FABRIC = {
  skus: {
    F16: { annual_usd: 16_000, label: "F16" },
    F32: { annual_usd: 32_000, label: "F32" },
    F64: { annual_usd: 63_000, label: "F64" },
  },
  sku_for_profile: {
    "OT-heavy":   "F64",
    "M365-heavy": "F32",
    "light":      "F16",
  },
} as const;

/* -------------------------------------------------------------------------- *
 *  Azure AI Search — annual contribution by tier.
 *  Evidence:
 *    S2 ~$12K/yr  (smaller corpus — CoP LNG, CoP Marathon Synergy)
 *    S3 ~$24K/yr  (large corpus — CoP Megaproject, HF Refining, HF Crude)
 * -------------------------------------------------------------------------- */
export const AI_SEARCH = {
  tiers: {
    S1: { annual_usd: 6_000,  max_docs: 5_000_000,   label: "S1" },
    S2: { annual_usd: 12_000, max_docs: 25_000_000,  label: "S2" },
    S3: { annual_usd: 24_000, max_docs: 100_000_000, label: "S3" },
  },
} as const;

/* -------------------------------------------------------------------------- *
 *  Azure Content Understanding — annual = base + per_doc × monthly_docs.
 *  Evidence (annual):
 *    2.5K docs/mo → $15K  (CoP LNG)
 *    3K docs/mo   → $20K  (CoP Megaproject, HF Crude)
 *    4K docs/mo   → $22K–$28K  (CoP Marathon Synergy, HF Refining)
 *  Fit: annual ≈ $5,000 base + $5.00 × monthly_docs.
 * -------------------------------------------------------------------------- */
export const CONTENT_UNDERSTANDING = {
  annual_base_usd: 5_000,
  annual_per_doc_per_mo_usd: 5.0,
  defaults_by_workload: {
    ot_real_time:          3_000,   // docs/mo
    megaproject_synthesis: 3_000,
    m365_synthesis:        4_000,
    commercial_optimization: 3_000,
    generic:               3_000,
  },
} as const;

/* -------------------------------------------------------------------------- *
 *  Foundry Agent Service runtime — annual per always-on agent.
 *  Evidence: 4 always-on agents → $18K–$22K annual.
 *  Per-agent: $4.5K–$5.5K annual.
 * -------------------------------------------------------------------------- */
export const FOUNDRY_AGENT_SERVICE = {
  annual_per_agent_usd: { low: 4_500, high: 5_500 },
  defaults_by_workload: {
    ot_real_time:          4,
    megaproject_synthesis: 4,
    m365_synthesis:        4,
    commercial_optimization: 4,
    generic:               4,
  },
} as const;

/* -------------------------------------------------------------------------- *
 *  Service Bus + Key Vault + Foundry IQ + monitoring — bundled "fixed-ish".
 *  Evidence (annual): $12K–$18K
 *    $12K — CoP Marathon Synergy (M365-heavy, lighter coupling)
 *    $14K — CoP LNG
 *    $16K — CoP Megaproject, HF Crude
 *    $18K — HF Refining (heaviest OT coupling)
 *  Heuristic: low for M365 profile, mid for mixed, high for OT-heavy.
 * -------------------------------------------------------------------------- */
export const SUPPORTING_SERVICES = {
  annual_usd_by_profile: {
    "M365-heavy": 12_000,
    "light":      13_000,
    "mixed":      15_000,
    "OT-heavy":   17_000,
  },
  components: [
    "Azure Service Bus (Premium)",
    "Azure Key Vault",
    "Foundry IQ (grounding + observability)",
    "Azure Monitor / Log Analytics",
  ],
} as const;

/* -------------------------------------------------------------------------- *
 *  Production overhead multiplier — applied to the sum of all annual line
 *  items to produce Y1 low/high. Per Microsoft planning guidance cited in
 *  the brief footnotes ("$X – $Y Y1 ACR with 15–40% production overhead").
 * -------------------------------------------------------------------------- */
export const PRODUCTION_OVERHEAD = {
  low_pct: 0.15,  // 15%
  high_pct: 0.40, // 40%
} as const;

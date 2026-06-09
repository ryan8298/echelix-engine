/**
 * estimate_acr — deterministic Azure Consumed Revenue sizing for one workload.
 *
 * Mirrors the math used in Echelix's published co-sell briefs:
 *   Y1 = sum(annual_line_items) × (1.15 → 1.40 production overhead)
 *
 * Calibrated against ConocoPhillips, HF Sinclair, Occidental, and Watts Water
 * briefs (June 2026). All numbers live in ./rate-card.ts — edit there.
 */

import {
  AI_SEARCH,
  CONTENT_UNDERSTANDING,
  FABRIC,
  FOUNDRY_AGENT_SERVICE,
  FOUNDRY_MODELS,
  PRODUCTION_OVERHEAD,
  RATE_CARD_PINNED_TO,
  SUPPORTING_SERVICES,
} from "./rate-card.js";

export type DataProfile = "OT-heavy" | "M365-heavy" | "light" | "mixed";
export type CorpusSize = "small" | "medium" | "large";
export type WorkloadType =
  | "ot_real_time"
  | "megaproject_synthesis"
  | "m365_synthesis"
  | "commercial_optimization"
  | "generic";

export type AcrInputs = {
  workload_type?: WorkloadType;
  data_profile?: DataProfile;
  corpus_size?: CorpusSize;            // → AI Search tier
  monthly_tokens?: number;             // blended GPT-5 + mini, tokens/mo
  monthly_docs?: number;               // → Content Understanding
  agent_count?: number;                // always-on agents
};

export type AcrLineItem = {
  component: string;
  driver: string;
  annual_low_usd: number;
  annual_high_usd: number;
};

export type AcrEstimate = {
  workload_type: WorkloadType;
  inputs_resolved: Required<Omit<AcrInputs, "workload_type">> & {
    workload_type: WorkloadType;
  };
  line_items: AcrLineItem[];
  subtotal_low_usd: number;
  subtotal_high_usd: number;
  year1_low_usd: number;               // subtotal × (1 + 15%)
  year1_high_usd: number;              // subtotal × (1 + 40%)
  overhead_pct: { low: number; high: number };
  pinned_to: string;
  range_label: string;                 // "$145K – $180K"
};

const DATA_PROFILE_DEFAULT_BY_WORKLOAD: Record<WorkloadType, DataProfile> = {
  ot_real_time:          "OT-heavy",
  megaproject_synthesis: "OT-heavy",
  m365_synthesis:        "M365-heavy",
  commercial_optimization: "OT-heavy",
  generic:               "mixed",
};

const CORPUS_SIZE_DEFAULT_BY_WORKLOAD: Record<WorkloadType, CorpusSize> = {
  ot_real_time:          "medium",
  megaproject_synthesis: "large",
  m365_synthesis:        "medium",
  commercial_optimization: "large",
  generic:               "medium",
};

const SEARCH_TIER_BY_CORPUS: Record<CorpusSize, keyof typeof AI_SEARCH.tiers> = {
  small: "S1",
  medium: "S2",
  large: "S3",
};

function fabricSkuFor(profile: DataProfile): keyof typeof FABRIC.skus {
  switch (profile) {
    case "OT-heavy":   return "F64";
    case "M365-heavy": return "F32";
    case "light":      return "F16";
    case "mixed":      return "F32";
  }
}

function fmtUsd(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}

export function estimateAcr(inputs: AcrInputs = {}): AcrEstimate {
  const workload_type: WorkloadType = inputs.workload_type ?? "generic";
  const data_profile = inputs.data_profile ?? DATA_PROFILE_DEFAULT_BY_WORKLOAD[workload_type];
  const corpus_size = inputs.corpus_size ?? CORPUS_SIZE_DEFAULT_BY_WORKLOAD[workload_type];
  const monthly_tokens =
    inputs.monthly_tokens ?? FOUNDRY_MODELS.defaults_by_workload[workload_type];
  const monthly_docs =
    inputs.monthly_docs ?? CONTENT_UNDERSTANDING.defaults_by_workload[workload_type];
  const agent_count =
    inputs.agent_count ?? FOUNDRY_AGENT_SERVICE.defaults_by_workload[workload_type];

  // --- Foundry Models -------------------------------------------------------
  const tokensM = monthly_tokens / 1_000_000;
  const foundryLow = tokensM * FOUNDRY_MODELS.annual_low_per_million_tokens_per_mo;
  const foundryHigh = tokensM * FOUNDRY_MODELS.annual_high_per_million_tokens_per_mo;

  // --- Fabric ---------------------------------------------------------------
  const fabricSku = fabricSkuFor(data_profile);
  const fabricAnnual = FABRIC.skus[fabricSku].annual_usd;

  // --- AI Search ------------------------------------------------------------
  const searchTier = SEARCH_TIER_BY_CORPUS[corpus_size];
  const searchAnnual = AI_SEARCH.tiers[searchTier].annual_usd;

  // --- Content Understanding -----------------------------------------------
  const cuAnnual =
    CONTENT_UNDERSTANDING.annual_base_usd +
    CONTENT_UNDERSTANDING.annual_per_doc_per_mo_usd * monthly_docs;

  // --- Foundry Agent Service -----------------------------------------------
  const fasLow = agent_count * FOUNDRY_AGENT_SERVICE.annual_per_agent_usd.low;
  const fasHigh = agent_count * FOUNDRY_AGENT_SERVICE.annual_per_agent_usd.high;

  // --- Supporting services -------------------------------------------------
  const supportingAnnual = SUPPORTING_SERVICES.annual_usd_by_profile[data_profile];

  const line_items: AcrLineItem[] = [
    {
      component: "Foundry Models (GPT-5 + GPT-5-mini, blended)",
      driver: `~${Math.round(monthly_tokens / 1_000_000)}M tokens/mo`,
      annual_low_usd: Math.round(foundryLow),
      annual_high_usd: Math.round(foundryHigh),
    },
    {
      component: `Microsoft Fabric ${FABRIC.skus[fabricSku].label}`,
      driver: `${data_profile} data profile`,
      annual_low_usd: fabricAnnual,
      annual_high_usd: fabricAnnual,
    },
    {
      component: `Azure AI Search ${AI_SEARCH.tiers[searchTier].label}`,
      driver: `${corpus_size} corpus`,
      annual_low_usd: searchAnnual,
      annual_high_usd: searchAnnual,
    },
    {
      component: "Azure Content Understanding",
      driver: `~${monthly_docs.toLocaleString()} docs/mo`,
      annual_low_usd: Math.round(cuAnnual),
      annual_high_usd: Math.round(cuAnnual),
    },
    {
      component: "Foundry Agent Service hosted runtime",
      driver: `${agent_count} always-on agents`,
      annual_low_usd: fasLow,
      annual_high_usd: fasHigh,
    },
    {
      component: "Service Bus + Key Vault + Foundry IQ + monitoring",
      driver: `${data_profile} coupling`,
      annual_low_usd: supportingAnnual,
      annual_high_usd: supportingAnnual,
    },
  ];

  const subtotal_low_usd = line_items.reduce((s, li) => s + li.annual_low_usd, 0);
  const subtotal_high_usd = line_items.reduce((s, li) => s + li.annual_high_usd, 0);

  const year1_low_usd = Math.round(subtotal_low_usd * (1 + PRODUCTION_OVERHEAD.low_pct));
  const year1_high_usd = Math.round(subtotal_high_usd * (1 + PRODUCTION_OVERHEAD.high_pct));

  return {
    workload_type,
    inputs_resolved: {
      workload_type,
      data_profile,
      corpus_size,
      monthly_tokens,
      monthly_docs,
      agent_count,
    },
    line_items,
    subtotal_low_usd,
    subtotal_high_usd,
    year1_low_usd,
    year1_high_usd,
    overhead_pct: {
      low: PRODUCTION_OVERHEAD.low_pct,
      high: PRODUCTION_OVERHEAD.high_pct,
    },
    pinned_to: RATE_CARD_PINNED_TO,
    range_label: `${fmtUsd(year1_low_usd)} – ${fmtUsd(year1_high_usd)}`,
  };
}

export type AccountAcr = {
  workloads: AcrEstimate[];
  combined_year1_low_usd: number;
  combined_year1_high_usd: number;
  combined_range_label: string;
};

/** Combine N workload estimates into a single account-level total. */
export function combineAcr(workloads: AcrEstimate[]): AccountAcr {
  const combined_year1_low_usd = workloads.reduce((s, w) => s + w.year1_low_usd, 0);
  const combined_year1_high_usd = workloads.reduce((s, w) => s + w.year1_high_usd, 0);
  return {
    workloads,
    combined_year1_low_usd,
    combined_year1_high_usd,
    combined_range_label: `${fmtUsd(combined_year1_low_usd)} – ${fmtUsd(combined_year1_high_usd)}`,
  };
}

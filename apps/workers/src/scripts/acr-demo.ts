/**
 * ACR demo — reproduces the workload estimates from the published briefs and
 * prints them next to the brief's stated range. Use this to sanity-check the
 * rate card whenever it's edited.
 *
 *   pnpm acr:demo
 */

import { combineAcr, estimateAcr, type AcrInputs } from "@echelix/core";

type Bench = {
  account: string;
  workload: string;
  brief_y1_low: number;
  brief_y1_high: number;
  inputs: AcrInputs;
};

const benchmarks: Bench[] = [
  {
    account: "ConocoPhillips",
    workload: "LNG Commercial Operations Agent",
    brief_y1_low: 145_000,
    brief_y1_high: 180_000,
    inputs: {
      workload_type: "ot_real_time",
      data_profile: "OT-heavy",
      corpus_size: "medium",      // S2
      monthly_tokens: 50_000_000,
      monthly_docs: 2_500,
      agent_count: 4,
    },
  },
  {
    account: "ConocoPhillips",
    workload: "Megaproject Health Synthesis Agent",
    brief_y1_low: 170_000,
    brief_y1_high: 210_000,
    inputs: {
      workload_type: "megaproject_synthesis",
      data_profile: "OT-heavy",
      corpus_size: "large",
      monthly_tokens: 60_000_000,
      monthly_docs: 3_000,
      agent_count: 4,
    },
  },
  {
    account: "ConocoPhillips",
    workload: "Marathon Synergy Capture Agent",
    brief_y1_low: 120_000,
    brief_y1_high: 145_000,
    inputs: {
      workload_type: "m365_synthesis",
      data_profile: "M365-heavy",
      corpus_size: "medium",
      monthly_tokens: 45_000_000,
      monthly_docs: 4_000,
      agent_count: 4,
    },
  },
  {
    account: "HF Sinclair",
    workload: "Refining Operations Agent",
    brief_y1_low: 175_000,
    brief_y1_high: 210_000,
    inputs: {
      workload_type: "ot_real_time",
      data_profile: "OT-heavy",
      corpus_size: "large",
      monthly_tokens: 55_000_000,
      monthly_docs: 4_000,
      agent_count: 4,
    },
  },
  {
    account: "HF Sinclair",
    workload: "Crude/Product Trading Agent",
    brief_y1_low: 165_000,
    brief_y1_high: 200_000,
    inputs: {
      workload_type: "commercial_optimization",
      data_profile: "OT-heavy",
      corpus_size: "large",
      monthly_tokens: 50_000_000,
      monthly_docs: 3_000,
      agent_count: 4,
    },
  },
];

function fmt(n: number): string {
  return `$${Math.round(n / 1_000)}K`;
}

console.log(`\nACR sizing benchmarks — engine vs. published briefs\n`);
console.log(
  `${"Account".padEnd(18)} ${"Workload".padEnd(38)} ${"Brief Y1".padEnd(18)} ${"Engine Y1".padEnd(18)} Δ low / Δ high`,
);
console.log("-".repeat(120));

let maxDiff = 0;
for (const b of benchmarks) {
  const est = estimateAcr(b.inputs);
  const dLow = est.year1_low_usd - b.brief_y1_low;
  const dHigh = est.year1_high_usd - b.brief_y1_high;
  maxDiff = Math.max(maxDiff, Math.abs(dLow), Math.abs(dHigh));
  console.log(
    `${b.account.padEnd(18)} ${b.workload.padEnd(38)} ${`${fmt(b.brief_y1_low)} – ${fmt(b.brief_y1_high)}`.padEnd(18)} ${est.range_label.padEnd(18)} ${dLow >= 0 ? "+" : ""}${fmt(dLow)} / ${dHigh >= 0 ? "+" : ""}${fmt(dHigh)}`,
  );
}

console.log("-".repeat(120));
console.log(`max abs delta vs briefs: ${fmt(maxDiff)}`);

// Combined example: full ConocoPhillips brief total.
const cop = combineAcr([
  estimateAcr(benchmarks[0]!.inputs),
  estimateAcr(benchmarks[1]!.inputs),
  estimateAcr(benchmarks[2]!.inputs),
]);
console.log(`\nConocoPhillips combined (3 workloads): ${cop.combined_range_label}`);
console.log(`Brief published combined: $435K – $945K (engine should sit in this band)`);

// Detailed breakdown for first workload
console.log(`\nLine-item detail — ConocoPhillips LNG Commercial Operations:`);
const lng = estimateAcr(benchmarks[0]!.inputs);
for (const li of lng.line_items) {
  const range =
    li.annual_low_usd === li.annual_high_usd
      ? fmt(li.annual_low_usd)
      : `${fmt(li.annual_low_usd)} – ${fmt(li.annual_high_usd)}`;
  console.log(`  ${li.component.padEnd(56)} (${li.driver})`.padEnd(96) + range);
}
console.log(`  ${"Subtotal".padEnd(56)}`.padEnd(96) + `${fmt(lng.subtotal_low_usd)} – ${fmt(lng.subtotal_high_usd)}`);
console.log(`  ${`Y1 with ${Math.round(lng.overhead_pct.low * 100)}–${Math.round(lng.overhead_pct.high * 100)}% production overhead`.padEnd(56)}`.padEnd(96) + lng.range_label);

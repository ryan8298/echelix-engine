/**
 * Signal → Echelix offering / reference matcher.
 * Pure-template: caller passes signals + DB-loaded offerings/references,
 * gets back the best offering pitch + reference engagement.
 */

export type Offering = {
  slug: string;
  kind: "product" | "service" | "pilot";
  name: string;
  one_liner: string | null;
  description: string | null;
  capabilities: string[];
  target_industries: string[];
  value_props: string[];
  signal_triggers: string[];
  pricing: string | null;
  engagement_model: string | null;
};

export type Reference = {
  customer_name: string;
  industry: string | null;
  rotation_bucket: string | null;
  framing_text: string | null;
  work_pattern: string | null;
  is_public: boolean;
};

export type SignalForMatch = {
  signal_type: string;
  signal_date: string | null;
  headline: string;
  relevance_tags: string[];
};

const HEADLINE_KEYWORD_TO_TAG: Array<{ tag: string; re: RegExp }> = [
  { tag: "copilot",     re: /\b(copilot|m365 copilot)\b/i },
  { tag: "fabric",      re: /\b(microsoft fabric|fabric capacity|fabric f\d+)\b/i },
  { tag: "foundry",     re: /\b(azure foundry|ai foundry|foundry agent service)\b/i },
  { tag: "azure",       re: /\b(azure|microsoft cloud)\b/i },
  { tag: "m365",        re: /\b(microsoft 365|m365 e[35]|sharepoint|teams)\b/i },
  { tag: "ai_hiring",   re: /\b(ai engineer|machine learning engineer|ai program manager|head of ai|chief ai)\b/i },
  { tag: "leadership_change", re: /\b(new (cio|coo|cto|cdo|cfo)|appointed (chief|president))\b/i },
  { tag: "throughput",  re: /\b(throughput|downtime|oee|sla|capacity utilization)\b/i },
  { tag: "compliance",  re: /\b(compliance|regulatory|audit|sox|gdpr|hipaa)\b/i },
  { tag: "modernization", re: /\b(plant modernization|digital transformation|smart factory|industry 4)\b/i },
];

/** Augment signals with our finer-grained tags (the news connector's tagging is coarse). */
export function deriveIcpTags(signals: SignalForMatch[]): Set<string> {
  const tags = new Set<string>();
  for (const s of signals) {
    for (const t of s.relevance_tags) tags.add(t);
    for (const { tag, re } of HEADLINE_KEYWORD_TO_TAG) {
      if (re.test(s.headline)) tags.add(tag);
    }
  }
  return tags;
}

/**
 * Pick the best offering to lead with based on detected tags.
 * Returns the top offering plus an optional secondary supporting one.
 */
export function pickOffering(opts: {
  offerings: Offering[];
  tags: Set<string>;
  industry: string;
}): { lead: Offering | null; supporting: Offering | null } {
  const { offerings, tags, industry } = opts;
  // Score each offering by: tag overlap + industry fit
  const scored = offerings.map((o) => {
    let score = 0;
    for (const t of o.signal_triggers) if (tags.has(t)) score += 2;
    if (o.target_industries.includes(industry)) score += 1;
    // Always prefer Embedded Agent Pilot when triggers signal pilot-readiness
    if (o.slug === "embedded_agent_pilot" && (tags.has("copilot") || tags.has("foundry") || tags.has("ai_hiring"))) score += 2;
    return { o, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const lead = scored[0]?.score ? scored[0]!.o : null;
  const supporting = scored[1] && scored[1].score > 0 && scored[1].o.slug !== lead?.slug ? scored[1].o : null;
  return { lead, supporting };
}

/** Pick the best reference engagement for the account's industry. */
export function pickReference(opts: {
  references: Reference[];
  industry: string;
}): Reference | null {
  const { references, industry } = opts;
  // Prefer exact rotation_bucket match on a public reference; fall back to any public reference.
  const exact = references.find((r) => r.rotation_bucket === industry && r.is_public);
  if (exact) return exact;
  return references.find((r) => r.is_public) ?? null;
}

/** Pick the top 3 signals to cite in an outreach email (motion-tagged + fresh). */
export function rankTopSignals(signals: SignalForMatch[], tags: Set<string>, max = 3): SignalForMatch[] {
  const motionTags = new Set(["leadership", "ma", "capex", "greenfield", "copilot", "fabric", "foundry", "azure", "ai_hiring", "leadership_change", "throughput", "modernization", "hiring"]);
  const scored = signals.map((s) => {
    const hasMotion = s.relevance_tags.some((t) => motionTags.has(t)) || [...tags].some((t) => motionTags.has(t) && new RegExp(t.replace("_", " "), "i").test(s.headline));
    const days = s.signal_date ? (Date.now() - new Date(s.signal_date).getTime()) / 86_400_000 : 9999;
    const freshness = Math.max(0, 1 - days / 90);
    return { signal: s, score: (hasMotion ? 1.5 : 0) + freshness };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.signal);
}

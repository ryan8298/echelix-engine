/**
 * Microsoft co-sell email drafter v2 — signals → offering matching.
 *
 * Inputs: account + microsoft_team + signals + Echelix offerings & references.
 * Output: subject + body + recipient, with the relevant Echelix offering and
 * reference engagement woven in. Tone: peer-to-peer with the MS AE.
 */

import { deriveIcpTags, pickOffering, pickReference, rankTopSignals, type Offering, type Reference, type SignalForMatch } from "./offerings";

const INDUSTRY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  oil_and_gas: "Oil & Gas",
  distribution_transportation: "Distribution & Transportation",
  manufacturing: "Manufacturing",
  financial_services: "Financial Services",
  other: "",
};

export type MicrosoftTeam = {
  ae?: { name?: string | null; email_alias?: string | null } | null;
  ats?: { name?: string | null; email_alias?: string | null } | null;
  industry_leader?: { name?: string | null; email_alias?: string | null } | null;
} | null;

type Person = { name?: string | null; email_alias?: string | null };
const FIRST_NAME = (full?: string | null) => full?.trim().split(/\s+/)[0] ?? null;
const aliasToEmail = (alias?: string | null) => alias ? `${alias.trim().toLowerCase()}@microsoft.com` : null;

function pickRecipient(team: MicrosoftTeam): { role: string; name: string | null; email: string | null } | null {
  const order: Array<{ role: string; person: Person | null | undefined }> = [
    { role: "AE", person: team?.ae },
    { role: "ATS", person: team?.ats },
    { role: "Industry Leader", person: team?.industry_leader },
  ];
  const hit = order.find((o) => o.person?.email_alias);
  if (!hit) return null;
  return { role: hit.role, name: hit.person?.name ?? null, email: aliasToEmail(hit.person?.email_alias) };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export type DraftAccount = {
  company_name: string;
  industry: string;
  microsoft_team: MicrosoftTeam;
};

export type DraftBrief = { id: string; brief_date: string };

export function draftMicrosoftEmail(opts: {
  account: DraftAccount;
  brief: DraftBrief;
  signals: SignalForMatch[];
  offerings: Offering[];
  references: Reference[];
  briefBaseUrl: string;
}): { subject: string; body: string; recipient_email: string | null; recipient_role: string | null; recipient_name: string | null; offering_used: string | null; reference_used: string | null } {
  const { account, brief, signals, offerings, references, briefBaseUrl } = opts;
  const industryLabel = INDUSTRY_LABEL[account.industry] || "";
  const pick = pickRecipient(account.microsoft_team);
  const greeting = FIRST_NAME(pick?.name) ?? "team";

  const tags = deriveIcpTags(signals);
  const { lead: leadOffering, supporting } = pickOffering({ offerings, tags, industry: account.industry });
  const ref = pickReference({ references, industry: account.industry });
  const topSignals = rankTopSignals(signals, tags, 3);

  const companyTitled = titleCase(account.company_name);
  const briefUrl = `${briefBaseUrl}/briefs/${brief.id}`;

  const subject = industryLabel
    ? `Co-sell brief — ${companyTitled} (${industryLabel})`
    : `Co-sell brief — ${companyTitled}`;

  const signalsBlock = topSignals.length === 0
    ? "Signals coming in this week — happy to share the latest when we connect."
    : topSignals.map((s) => `• ${s.headline}`).join("\n");

  const offeringLine = leadOffering
    ? leadOffering.slug === "embedded_agent_pilot"
      ? `We'd lead with our Embedded Agent Pilot — fixed-fee, outcome-based, 60 days on Foundry Agent Service. Built on Lattice, so the foundation goes in within 2-4 weeks.`
      : leadOffering.slug === "lattice"
        ? `We'd lead with Lattice — our pre-built Azure foundation (Bicep IaC, AI services + Service Bus agent messaging) — 2-4 weeks to first workload instead of 6-12 months.`
        : leadOffering.slug === "cortex"
          ? `Cortex looks like the right wedge here — it's our intelligence layer for M365 (Email/Teams/SharePoint via Graph), with auto-task creation, semantic search, and zero manual CRM entry.`
          : leadOffering.slug === "opportunity_mapping"
            ? `Given where they are, AI Opportunity Mapping is the right starting motion — a guided session that delivers personas, value stream map, and prioritized agent roadmap.`
            : `Our ${leadOffering.name} engagement fits the moment — ${leadOffering.one_liner ?? ""}`
    : `We'd anchor with our Embedded Agent Pilot — 60-day, outcome-based, $75K–$150K fixed fee on Foundry Agent Service.`;

  const supportingLine = supporting && supporting.slug !== leadOffering?.slug
    ? `${supporting.name} would be the natural follow-on once the pilot is delivering.`
    : "";

  const referenceLine = ref?.framing_text
    ? `For credibility: ${ref.framing_text}.`
    : "";

  const body = `Hi ${greeting},

Sharing our latest Echelix co-sell brief for ${companyTitled}. ${industryLabel ? `Three prioritized Foundry workloads with defensible ACR math, sized for your ${industryLabel.toLowerCase()} territory.` : "Three prioritized Foundry workloads with defensible ACR math."}

What's driving timing right now:
${signalsBlock}

${offeringLine}${supportingLine ? " " + supportingLine : ""}

${referenceLine ? referenceLine + "\n\n" : ""}Brief and prototype commitment: ${briefUrl}

Happy to set up 30 minutes to walk through it and decide which workload to lead with.

— Ryan
ryan.roberts@echelix.com`;

  return {
    subject,
    body,
    recipient_email: pick?.email ?? null,
    recipient_role: pick?.role ?? null,
    recipient_name: pick?.name ?? null,
    offering_used: leadOffering?.slug ?? null,
    reference_used: ref?.customer_name ?? null,
  };
}

// Back-compat: keep the old single-arg shape working if anything imports it.
export type { SignalForMatch as SignalForEmail };

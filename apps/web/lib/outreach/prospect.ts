/**
 * Direct prospect email drafter — for the target buyer at the customer (not
 * the Microsoft AE). Tone is direct, problem-focused, less Microsoft-co-sell
 * positioning, more "we've done this for companies like yours."
 *
 * Contact resolution: deferred — for now caller supplies a placeholder
 * recipient (or leaves blank for manual fill). Apollo people search lands
 * in the next iteration.
 */

import { deriveIcpTags, pickOffering, pickReference, rankTopSignals, type Offering, type Reference, type SignalForMatch } from "./offerings";

const INDUSTRY_LABEL: Record<string, string> = {
  utilities: "utilities",
  oil_and_gas: "oil & gas",
  distribution_transportation: "transportation",
  manufacturing: "manufacturing",
  financial_services: "financial services",
  other: "",
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ProspectContact = {
  name?: string | null;
  title?: string | null;
  email?: string | null;
};

export function draftProspectEmail(opts: {
  account: { company_name: string; industry: string };
  signals: SignalForMatch[];
  offerings: Offering[];
  references: Reference[];
  contact?: ProspectContact | null;
}): { subject: string; body: string; recipient_email: string | null; recipient_name: string | null; offering_used: string | null; reference_used: string | null } {
  const { account, signals, offerings, references, contact } = opts;
  const companyTitled = titleCase(account.company_name);
  const industryLabel = INDUSTRY_LABEL[account.industry] || "your operations";

  const tags = deriveIcpTags(signals);
  const { lead: leadOffering } = pickOffering({ offerings, tags, industry: account.industry });
  const ref = pickReference({ references, industry: account.industry });
  const top = rankTopSignals(signals, tags, 2);

  // First name greeting if we have one, else generic.
  const greeting = contact?.name
    ? contact.name.trim().split(/\s+/)[0]
    : contact?.title
      ? `${contact.title}`
      : "team";

  // Subject lines that *don't* look like spam. Tied to the most relevant trigger.
  let subject: string;
  if (tags.has("copilot") || tags.has("foundry")) {
    subject = `Quick note on your Copilot/Foundry direction at ${companyTitled}`;
  } else if (tags.has("leadership_change") || tags.has("leadership")) {
    subject = `Following the leadership change at ${companyTitled}`;
  } else if (tags.has("capex") || tags.has("modernization")) {
    subject = `On your ${industryLabel} modernization commitments`;
  } else if (tags.has("ai_hiring") || tags.has("hiring")) {
    subject = `Your AI hiring at ${companyTitled} — a faster path to delivery`;
  } else {
    subject = `60-day agent pilot for ${companyTitled} — outcome-based`;
  }

  const signalLine = top.length > 0
    ? `Noticed ${top[0]!.headline.replace(/[" ]+$/g, "")}${top[1] ? `, plus ${top[1].headline.replace(/[" ]+$/g, "").toLowerCase()}` : ""}.`
    : `We've been tracking the public signals coming out of ${companyTitled}.`;

  // Match offering to a direct-to-buyer pitch line (different from MS co-sell tone)
  const offerLine = leadOffering?.slug === "embedded_agent_pilot"
    ? `We run a 60-day Embedded Agent Pilot ($75K–$150K, fixed-fee, outcome-based) on Microsoft Foundry Agent Service. We commit to a named KPI before week one. If we don't move the metric, the engagement doesn't continue.`
    : leadOffering?.slug === "lattice"
      ? `Our Lattice product is a pre-built, code-defined Azure foundation. Companies like yours typically take 6-12 months to stand this up; with us, you're in production in 2-4 weeks. AI agents are first-class, not bolted on.`
      : leadOffering?.slug === "cortex"
        ? `Cortex is our intelligence layer on top of M365. If your team is sitting on action items buried in email, decisions lost in Teams, and SharePoint that nobody can find anything in, we make that disappear. About 70% reduction in manual email processing in production.`
        : leadOffering?.slug === "opportunity_mapping"
          ? `Before any build, we'd run an AI Opportunity Mapping session — a guided workshop that maps where AI actually creates measurable value in your business, with an agent architecture and prioritized roadmap as output.`
          : `Our standard motion is a 60-day Embedded Agent Pilot ($75K–$150K, fixed-fee, outcome-based) on Foundry Agent Service.`;

  const refLine = ref && ref.is_public
    ? `For context on the pattern: ${ref.framing_text}.`
    : "";

  const body = `Hi ${greeting},

${signalLine}

${offerLine}

${refLine ? refLine + "\n\n" : ""}If that resonates, I'd send a 1-page brief showing the three workloads we'd prioritize for ${companyTitled} — and the named buyer at your team for each.

30 minutes next week to walk through?

— Ryan Roberts
Echelix · ryan.roberts@echelix.com`;

  return {
    subject,
    body,
    recipient_email: contact?.email ?? null,
    recipient_name: contact?.name ?? null,
    offering_used: leadOffering?.slug ?? null,
    reference_used: ref?.customer_name ?? null,
  };
}

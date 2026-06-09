/**
 * Microsoft co-sell email drafter.
 *
 * Pure template logic — takes account + brief + top signals, returns
 * { subject, body, recipient }. Caller persists to outreach table.
 *
 * Recipient priority: AE → ATS → Industry Leader. The first one with an
 * email_alias wins. The brief link goes to the Vercel-hosted URL so the
 * Microsoft account team can read it without local access.
 */

const INDUSTRY_LABEL: Record<string, string> = {
  utilities: "Utilities",
  oil_and_gas: "Oil & Gas",
  distribution_transportation: "Distribution & Transportation",
  manufacturing: "Manufacturing",
  financial_services: "Financial Services",
};

export type MicrosoftTeam = {
  ae?: { name?: string | null; email_alias?: string | null } | null;
  ats?: { name?: string | null; email_alias?: string | null } | null;
  industry_leader?: { name?: string | null; email_alias?: string | null } | null;
  stu_cloud_ai?: { name?: string | null; email_alias?: string | null } | null;
} | null;

export type SignalForEmail = {
  signal_type: string;
  signal_date: string | null;
  headline: string;
  relevance_tags: string[] | null;
};

export type DraftAccount = {
  company_name: string;
  industry: string;
  microsoft_team: MicrosoftTeam;
};

export type DraftBrief = {
  id: string;
  brief_date: string;
};

const FIRST_NAME = (full?: string | null) => (full?.trim().split(/\s+/)[0]) ?? null;

const aliasToEmail = (alias?: string | null) =>
  alias ? `${alias.trim().toLowerCase()}@microsoft.com` : null;

type Person = { name?: string | null; email_alias?: string | null };

function pickRecipient(team: MicrosoftTeam): { role: string; name: string | null; email: string | null } | null {
  const ordered: Array<{ role: string; person: Person | null | undefined }> = [
    { role: "AE", person: team?.ae },
    { role: "ATS", person: team?.ats },
    { role: "Industry Leader", person: team?.industry_leader },
  ];
  const hit = ordered.find((o) => o.person?.email_alias);
  if (!hit) return null;
  return {
    role: hit.role,
    name: hit.person?.name ?? null,
    email: aliasToEmail(hit.person?.email_alias),
  };
}

function rankTopSignals(signals: SignalForEmail[], max = 3): SignalForEmail[] {
  // Prefer signals with motion-aligned tags; fall back to freshness.
  const TAG_PRIORITY = new Set(["leadership", "capex", "ma", "greenfield", "microsoft", "azure", "hiring"]);
  const scored = signals.map((s) => {
    const tagBoost = (s.relevance_tags ?? []).some((t) => TAG_PRIORITY.has(t)) ? 1 : 0;
    const days = s.signal_date ? (Date.now() - new Date(s.signal_date).getTime()) / 86_400_000 : 9999;
    const freshness = Math.max(0, 1 - days / 90);
    return { signal: s, score: tagBoost + freshness };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.signal);
}

export function draftMicrosoftEmail(opts: {
  account: DraftAccount;
  brief: DraftBrief;
  signals: SignalForEmail[];
  briefBaseUrl: string;       // e.g. https://echelix-engine-web.vercel.app
}): { subject: string; body: string; recipient_email: string | null; recipient_role: string | null; recipient_name: string | null } {
  const { account, brief, signals, briefBaseUrl } = opts;
  const industryLabel = INDUSTRY_LABEL[account.industry] ?? account.industry;
  const pick = pickRecipient(account.microsoft_team);
  const greeting = FIRST_NAME(pick?.name) ?? "team";
  const top = rankTopSignals(signals, 3);
  const briefUrl = `${briefBaseUrl}/briefs/${brief.id}`;

  const subject = `Co-sell brief — ${titleCase(account.company_name)} (${industryLabel})`;

  const signalsBlock = top.length === 0
    ? "Signals coming in this week — happy to share the latest when we connect."
    : top.map((s) => `• ${s.headline}`).join("\n");

  const body = `Hi ${greeting},

Sharing our latest Echelix co-sell brief for ${titleCase(account.company_name)}. Three prioritized Foundry workloads with defensible ACR math, ready for your Q1 pipeline conversation.

What's driving timing right now:
${signalsBlock}

Brief and prototype commitment: ${briefUrl}

Happy to set up 30 minutes to walk through it and decide which workload to lead with.

— Ryan
ryan.roberts@echelix.com`;

  return {
    subject,
    body,
    recipient_email: pick?.email ?? null,
    recipient_role: pick?.role ?? null,
    recipient_name: pick?.name ?? null,
  };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bLlc\b/g, "LLC").replace(/\bInc\b/g, "Inc");
}

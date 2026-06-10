/**
 * Apollo people search + enrichment, server-side.
 * Used by the "Find prospect" button on prospect outreach cards.
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

export type ApolloPerson = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  organization_name: string | null;
  email: string | null;            // populated after enrichment
  email_status: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
};

export type SearchOpts = {
  apiKey: string;
  organizationDomain?: string | null;
  organizationName?: string | null;
  titles: string[];                // ranked list — first tier first
  seniorities?: string[];          // ['c_suite', 'vp', 'director']
  perPage?: number;
};

/**
 * Hierarchy-aware people search. Tries Tier 1 (C-suite/VP) first; if fewer
 * than 3 results, also searches Tier 2 (Director) and merges.
 */
export async function searchProspects(opts: SearchOpts): Promise<ApolloPerson[]> {
  const t1Seniority = opts.seniorities ?? ["c_suite", "vp"];
  const tier1 = await searchOnce(opts, { person_seniorities: t1Seniority });

  if (tier1.length >= 3) return tier1;

  const tier2 = await searchOnce(opts, { person_seniorities: ["director"] });
  // Merge, dedupe by id, cap at 10
  const all = [...tier1, ...tier2.filter((p) => !tier1.find((t) => t.id === p.id))];
  return all.slice(0, 10);
}

type ExtraFilters = { person_seniorities: string[] };
async function searchOnce(opts: SearchOpts, extra: ExtraFilters): Promise<ApolloPerson[]> {
  const body: Record<string, unknown> = {
    per_page: opts.perPage ?? 5,
    page: 1,
    person_titles: opts.titles.slice(0, 10),
    include_similar_titles: true,
    person_seniorities: extra.person_seniorities,
  };
  if (opts.organizationDomain) body.q_organization_domains_list = [opts.organizationDomain];
  else if (opts.organizationName) body.q_keywords = opts.organizationName;
  else return [];

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": opts.apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apollo people search: ${res.status}`);
  const data = (await res.json()) as { people?: Array<Record<string, unknown>>; contacts?: Array<Record<string, unknown>> };
  const rows = [...(data.people ?? []), ...(data.contacts ?? [])];
  return rows.map((r) => ({
    id: String(r.id ?? r.person_id ?? ""),
    name: String(r.name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`).trim(),
    first_name: (r.first_name as string | null) ?? null,
    last_name: (r.last_name as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    seniority: (r.seniority as string | null) ?? null,
    organization_name: ((r.organization as { name?: string } | undefined)?.name) ?? (r.organization_name as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    email_status: (r.email_status as string | null) ?? null,
    linkedin_url: (r.linkedin_url as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
  }));
}

/**
 * Enrich a person to reveal their email. Costs 1 Apollo credit per match.
 */
export async function enrichPerson(apiKey: string, opts: { id?: string; first_name?: string; last_name?: string; organization_name?: string; domain?: string }): Promise<ApolloPerson | null> {
  const body: Record<string, unknown> = {};
  if (opts.id) body.id = opts.id;
  if (opts.first_name) body.first_name = opts.first_name;
  if (opts.last_name) body.last_name = opts.last_name;
  if (opts.organization_name) body.organization_name = opts.organization_name;
  if (opts.domain) body.domain = opts.domain;
  body.reveal_personal_emails = false; // work email only

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { person?: Record<string, unknown> };
  if (!data.person) return null;
  const r = data.person;
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`).trim(),
    first_name: (r.first_name as string | null) ?? null,
    last_name: (r.last_name as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    seniority: (r.seniority as string | null) ?? null,
    organization_name: ((r.organization as { name?: string } | undefined)?.name) ?? null,
    email: (r.email as string | null) ?? null,
    email_status: (r.email_status as string | null) ?? null,
    linkedin_url: (r.linkedin_url as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
  };
}

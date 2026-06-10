"use server";

import { getAdminSupabase, requireUser } from "@/lib/supabase/server";
import { searchProspects, enrichPerson, type ApolloPerson } from "@/lib/apollo/people";

const DEFAULT_TITLES = [
  "Chief Information Officer", "CIO",
  "Chief Operating Officer", "COO",
  "Chief Digital Officer", "CDO",
  "VP Operations", "Vice President of Operations",
  "VP Information Technology", "VP IT",
  "Director of Operations",
  "Director of Application Innovation",
  "Director of Data", "Director of AI",
  "Director of Manufacturing IT",
];

async function loadIcpTitles(): Promise<string[]> {
  const sb = getAdminSupabase();
  const { data } = await sb.from("engine_config").select("value").eq("key", "icp").maybeSingle();
  const v = (data?.value as { target_buyer_titles?: string[] } | null) ?? null;
  if (v?.target_buyer_titles && v.target_buyer_titles.length > 0) return v.target_buyer_titles;
  return DEFAULT_TITLES;
}

export type ProspectSearchResult = {
  candidates: ApolloPerson[];
  used_filters: { domain: string | null; company: string | null; titles: string[] };
};

export async function findProspectsForBrief(briefId: string): Promise<{ ok?: ProspectSearchResult; error?: string }> {
  await requireUser();
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { error: "APOLLO_API_KEY not set on the server" };
  const sb = getAdminSupabase();

  const { data: brief } = await sb.from("briefs")
    .select("account_id, accounts(company_name, industry, domain, source_industry)")
    .eq("id", briefId).maybeSingle();
  if (!brief) return { error: "Brief not found" };
  const acc = (brief.accounts as unknown) as { company_name: string; industry: string; domain: string | null; source_industry: string | null } | null;
  if (!acc) return { error: "Account missing on brief" };

  const titles = await loadIcpTitles();

  try {
    const candidates = await searchProspects({
      apiKey,
      organizationDomain: acc.domain,
      organizationName: acc.company_name,
      titles,
    });
    return {
      ok: {
        candidates,
        used_filters: { domain: acc.domain, company: acc.company_name, titles },
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function enrichAndSetOutreachRecipient(
  outreachId: string,
  person: { id?: string; first_name?: string | null; last_name?: string | null; organization_name?: string | null; domain?: string | null; existingEmail?: string | null },
): Promise<{ ok?: { email: string; name: string }; error?: string }> {
  await requireUser();
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { error: "APOLLO_API_KEY not set" };
  const sb = getAdminSupabase();

  let email = person.existingEmail ?? null;
  let displayName = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();

  if (!email) {
    const enriched = await enrichPerson(apiKey, {
      id: person.id,
      first_name: person.first_name ?? undefined,
      last_name: person.last_name ?? undefined,
      organization_name: person.organization_name ?? undefined,
      domain: person.domain ?? undefined,
    });
    if (enriched?.email) {
      email = enriched.email;
      if (enriched.name) displayName = enriched.name;
    }
  }

  if (!email) return { error: "Apollo could not resolve a verified work email for this person" };
  const { error } = await sb.from("outreach").update({ recipient: email }).eq("id", outreachId);
  if (error) return { error: error.message };
  return { ok: { email, name: displayName } };
}

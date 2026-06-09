/**
 * Apollo connector — REST against api.apollo.io.
 *
 * Used by the revenue gate (Stage 2 — estimated revenue for EDGAR misses)
 * and later by Loop 1 enrichment + Loop 2 contact staging.
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

export type ApolloOrgMatch = {
  id: string;
  name: string;
  primary_domain: string | null;
  publicly_traded_symbol: string | null;
  publicly_traded_exchange: string | null;
  organization_revenue: number | null;     // USD
  organization_revenue_printed: string | null;
  sic_codes: string[] | null;
  naics_codes: string[] | null;
  total_entries: number;                   // pagination total — disambiguation signal
};

export class Apollo {
  constructor(private apiKey: string) {
    if (!apiKey) throw new Error("APOLLO_API_KEY not set");
  }

  /**
   * Search for an organization by name. Returns the top hit plus the total
   * result count (so the caller can flag ambiguous matches).
   */
  async searchByName(name: string): Promise<ApolloOrgMatch | null> {
    const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": this.apiKey,
      },
      body: JSON.stringify({ q_organization_name: name, per_page: 3, page: 1 }),
    });
    if (!res.ok) {
      throw new Error(`apollo search "${name}": ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      pagination?: { total_entries?: number };
      organizations?: Array<Record<string, unknown>>;
    };
    const orgs = data.organizations ?? [];
    if (orgs.length === 0) return null;
    const top = orgs[0]!;
    const rev = top.organization_revenue;
    return {
      id: String(top.id),
      name: String(top.name ?? ""),
      primary_domain: (top.primary_domain as string | null) ?? null,
      publicly_traded_symbol: (top.publicly_traded_symbol as string | null) ?? null,
      publicly_traded_exchange: (top.publicly_traded_exchange as string | null) ?? null,
      organization_revenue: typeof rev === "number" && rev > 0 ? rev : null,
      organization_revenue_printed:
        (top.organization_revenue_printed as string | null) ?? null,
      sic_codes: (top.sic_codes as string[] | null) ?? null,
      naics_codes: (top.naics_codes as string[] | null) ?? null,
      total_entries: data.pagination?.total_entries ?? 0,
    };
  }
}

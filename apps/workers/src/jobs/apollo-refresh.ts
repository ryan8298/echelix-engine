/**
 * Refresh one account's Apollo data — meant to be invoked on demand from
 * the web app (single-account "Refresh Apollo" button), not on a schedule.
 *
 *   pnpm apollo:refresh -- --tpid=641547
 *
 * Costs 1 Apollo credit per call. Writes:
 *   - signals row of type 'tech_stack' (Apollo's view, including domain/ticker)
 *   - account: domain, ticker if Apollo has them and we don't
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../.env") });

import { createServiceClient } from "@echelix/db";
import { Apollo } from "@echelix/connectors";

function arg(k: string): string | null {
  return process.argv.slice(2).find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? null;
}

async function main() {
  const tpid = arg("tpid");
  if (!tpid) throw new Error("--tpid=<id> required");
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY not set");

  const sb = createServiceClient();
  const { data: account, error } = await sb.from("accounts")
    .select("id,company_name,domain,ticker")
    .eq("tpid", Number(tpid))
    .maybeSingle();
  if (error) throw error;
  if (!account) throw new Error(`No account with tpid=${tpid}`);

  const apollo = new Apollo(apiKey);
  const match = await apollo.searchByName(account.company_name as string);

  if (!match) {
    console.log(`[apollo:refresh] no match for ${account.company_name}`);
    return;
  }

  const upd: Record<string, unknown> = { last_researched: new Date().toISOString() };
  if (!account.domain && match.primary_domain) upd.domain = match.primary_domain;
  if (!account.ticker && match.publicly_traded_symbol) upd.ticker = match.publicly_traded_symbol;
  await sb.from("accounts").update(upd).eq("id", account.id as string);

  await sb.from("signals").insert({
    account_id: account.id as string,
    signal_type: "tech_stack",
    signal_date: new Date().toISOString().slice(0, 10),
    headline: `Apollo profile — ${match.name}${match.organization_revenue_printed ? ` (rev ~${match.organization_revenue_printed})` : ""}`,
    detail: JSON.stringify({
      apollo_id: match.id,
      domain: match.primary_domain,
      ticker: match.publicly_traded_symbol,
      exchange: match.publicly_traded_exchange,
      sic: match.sic_codes,
      naics: match.naics_codes,
      revenue_usd: match.organization_revenue,
      total_entries: match.total_entries,
    }),
    source_url: `https://app.apollo.io/#/companies/${match.id}`,
    relevance_tags: ["apollo"],
  });

  console.log(`[apollo:refresh] ${account.company_name} → ${match.name} (apollo_id ${match.id})`);
}

main().catch((e) => { console.error("[apollo:refresh] FAILED:", e); process.exit(1); });

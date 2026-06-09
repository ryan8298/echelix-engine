/**
 * Stage 0 — Revenue validation gate.
 *
 * Cascade per in-rotation account:
 *   1. EDGAR (free) — resolve name to CIK, pull most recent 10-K annual revenue.
 *   2. Apollo  (1 credit/account) — name search; capture estimated revenue.
 *   3. Neither yields a usable figure → status='pending' + verdict='no_data_review'.
 *
 * Verdict rules (USD):
 *   < $450M                 → out_of_range
 *   $450M  – $550M          → no_data_review  (lower boundary, 10% tiebreaker)
 *   $550M  – $4.5B          → in_range
 *   $4.5B  – $5.5B          → no_data_review  (upper boundary)
 *   > $5.5B                 → out_of_range
 *
 *   pnpm gate:revenue                          # full cascade, live writes
 *   pnpm gate:revenue -- --dry-run             # report only, no writes
 *   pnpm gate:revenue -- --edgar-only          # skip Apollo (free pass)
 *   pnpm gate:revenue -- --limit=50            # process first N accounts
 *   pnpm gate:revenue -- --tpid=641547         # one account by TPID
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../.env") });

import { createServiceClient } from "@echelix/db";
import { edgar, Apollo } from "@echelix/connectors";
import { loadConfig, type RevenueBand } from "@echelix/core";

type Verdict = "in_range" | "out_of_range" | "no_data_review";

function classify(amount: number, band: RevenueBand): Verdict {
  const tie = band.tiebreaker_pct;
  const lowerTieMin = band.lower_usd * (1 - tie);
  const lowerTieMax = band.lower_usd * (1 + tie);
  const upperTieMin = band.upper_usd * (1 - tie);
  const upperTieMax = band.upper_usd * (1 + tie);
  if (amount >= lowerTieMin && amount <= lowerTieMax) return "no_data_review";
  if (amount >= upperTieMin && amount <= upperTieMax) return "no_data_review";
  if (amount < band.lower_usd) return "out_of_range";
  if (amount > band.upper_usd) return "out_of_range";
  return "in_range";
}

type Args = {
  dryRun: boolean;
  edgarOnly: boolean;
  limit: number | null;
  tpid: number | null;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    dryRun: args.includes("--dry-run"),
    edgarOnly: args.includes("--edgar-only"),
    limit: get("limit") ? Number(get("limit")) : null,
    tpid: get("tpid") ? Number(get("tpid")) : null,
  };
}

type AccountRow = {
  id: string;
  tpid: number;
  company_name: string;
  industry: string;
};

type Stage1 = {
  source: "edgar";
  amount: number;
  ticker: string;
  cik: string;
  fiscal_year: number;
  end_date: string;
  source_url: string;
};

type Stage2 = {
  source: "apollo";
  amount: number;
  apollo_id: string;
  domain: string | null;
  ticker: string | null;
  total_entries: number;
  suspect: boolean;
  source_url: string;
};

async function tryEdgar(name: string): Promise<Stage1 | null> {
  const hit = await edgar.resolveCompany(name);
  if (!hit) return null;
  const rev = await edgar.fetchAnnualRevenue(hit.cik);
  if (!rev) return null;
  return {
    source: "edgar",
    amount: rev.amount_usd,
    ticker: hit.ticker,
    cik: hit.cik,
    fiscal_year: rev.fiscal_year,
    end_date: rev.end_date,
    source_url: rev.source_url,
  };
}

async function tryApollo(apollo: Apollo, name: string): Promise<Stage2 | null> {
  const m = await apollo.searchByName(name);
  if (!m) return null;
  if (m.organization_revenue == null) return null;
  const suspect = m.total_entries > 100; // ambiguity guard; corroboration TBD when we have domains
  return {
    source: "apollo",
    amount: m.organization_revenue,
    apollo_id: m.id,
    domain: m.primary_domain,
    ticker: m.publicly_traded_symbol,
    total_entries: m.total_entries,
    suspect,
    source_url: `https://app.apollo.io/#/companies/${m.id}`,
  };
}

async function main() {
  const args = parseArgs();
  console.log(`[gate] args=${JSON.stringify(args)}`);

  const supabase = createServiceClient();
  const cfg = await loadConfig(supabase);
  console.log(`[gate] band ${(cfg.revenue_band.lower_usd / 1e9).toFixed(2)}B – ${(cfg.revenue_band.upper_usd / 1e9).toFixed(2)}B (±${(cfg.revenue_band.tiebreaker_pct * 100).toFixed(0)}% tiebreaker)`);

  const sel = supabase
    .from("accounts")
    .select("id,tpid,company_name,industry")
    .eq("status", "pending")
    .neq("industry", "other");
  if (args.tpid) sel.eq("tpid", args.tpid);
  if (args.limit) sel.limit(args.limit);
  sel.order("company_name", { ascending: true });

  const { data: rows, error } = await sel;
  if (error) throw error;
  const accounts = (rows ?? []) as AccountRow[];
  console.log(`[gate] ${accounts.length} accounts queued`);

  // run_log start
  let runId: string | null = null;
  if (!args.dryRun) {
    const { data, error: re } = await supabase
      .from("run_log")
      .insert({
        loop_name: "stage0_gate",
        details: { args, queued: accounts.length },
      })
      .select("id")
      .single();
    if (re) throw re;
    runId = data!.id;
  }

  const apolloKey = process.env.APOLLO_API_KEY;
  const apollo = apolloKey && !args.edgarOnly ? new Apollo(apolloKey) : null;
  if (!args.edgarOnly && !apollo) {
    console.log(`[gate] APOLLO_API_KEY not set — running EDGAR-only`);
  }

  const counts = {
    in_range: 0,
    out_of_range: 0,
    no_data_review: 0,
    edgar_hits: 0,
    apollo_hits: 0,
    apollo_suspect: 0,
    misses: 0,
    errors: 0,
  };

  const samples: Array<Record<string, unknown>> = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]!;
    try {
      let result: Stage1 | Stage2 | null = await tryEdgar(acc.company_name);
      if (result) counts.edgar_hits++;

      if (!result && apollo) {
        result = await tryApollo(apollo, acc.company_name);
        if (result) {
          counts.apollo_hits++;
          if ((result as Stage2).suspect) counts.apollo_suspect++;
        }
      }

      let verdict: Verdict;
      let confidence: "audited" | "estimated" | "unverified" | null = null;
      let metric: "10k_annual" | "ttm" | "estimate" | null = null;
      let asOf: string | null = null;

      if (!result) {
        counts.misses++;
        verdict = "no_data_review";
      } else if (result.source === "edgar") {
        verdict = classify(result.amount, cfg.revenue_band);
        confidence = "audited";
        metric = "10k_annual";
        asOf = result.end_date;
      } else {
        verdict = (result as Stage2).suspect ? "no_data_review" : classify(result.amount, cfg.revenue_band);
        confidence = "estimated";
        metric = "estimate";
      }
      counts[verdict]++;

      if (samples.length < 15) {
        samples.push({
          tpid: acc.tpid,
          name: acc.company_name,
          industry: acc.industry,
          source: result?.source ?? "none",
          amount: result?.amount ?? null,
          verdict,
          suspect: result?.source === "apollo" ? (result as Stage2).suspect : false,
        });
      }

      if (!args.dryRun && result) {
        const newStatus =
          verdict === "in_range"
            ? "active"
            : verdict === "out_of_range"
              ? "out_of_range"
              : "pending";
        await supabase
          .from("accounts")
          .update({
            annual_revenue_usd: result.amount,
            revenue_metric: metric,
            revenue_confidence: confidence,
            revenue_as_of: asOf,
            revenue_verdict: verdict,
            revenue_source_url: result.source_url,
            ticker: result.source === "edgar" ? result.ticker : (result as Stage2).ticker,
            domain: result.source === "apollo" ? (result as Stage2).domain : undefined,
            last_researched: new Date().toISOString(),
            status: newStatus,
          })
          .eq("id", acc.id);
      } else if (!args.dryRun && !result) {
        await supabase
          .from("accounts")
          .update({
            revenue_verdict: "no_data_review",
            last_researched: new Date().toISOString(),
          })
          .eq("id", acc.id);
      }

      if ((i + 1) % 25 === 0) {
        console.log(`[gate] ${i + 1}/${accounts.length}  edgar=${counts.edgar_hits} apollo=${counts.apollo_hits} miss=${counts.misses}`);
      }
    } catch (e) {
      counts.errors++;
      console.error(`[gate] error on ${acc.company_name}:`, (e as Error).message);
    }
  }

  console.log(`\n[gate] results:`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\n[gate] sample (first ${samples.length}):`);
  for (const s of samples) console.log(`  ${JSON.stringify(s)}`);

  if (!args.dryRun && runId) {
    await supabase
      .from("run_log")
      .update({
        finished_at: new Date().toISOString(),
        status: counts.errors === 0 ? "ok" : "partial",
        accounts_touched: accounts.length,
        details: { args, counts, samples },
      })
      .eq("id", runId);
    console.log(`\n[gate] run_log id=${runId}`);
  } else if (args.dryRun) {
    console.log(`\n[gate] --dry-run: no writes.`);
  }
}

main().catch((e) => {
  console.error("[gate] FAILED:", e);
  process.exit(1);
});

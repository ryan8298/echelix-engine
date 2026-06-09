/**
 * Loop 1 — Continuous enrichment.
 *
 * Per blueprint §4: refresh signals on tiered cadence, write to signals table
 * only. Decides nothing.
 *
 * Tiering rules (this run):
 *   - hot   → eligible if last_researched is null or > 1 day ago
 *   - warm  → > 7 days
 *   - cold  → > 30 days
 *
 * Post-run tier update:
 *   - has any signal with signal_date in last 14 days → tier = 'hot'
 *   - else has any in last 60 days                    → tier = 'warm'
 *   - else                                            → tier = 'cold'
 *
 * Sources wired in this step (all free):
 *   - Google News RSS (news + leadership inferred via tags)
 *   - SEC EDGAR submissions (10-K, 10-Q, 8-K filings)
 *
 * Apollo job postings + tech stack are wired separately after the credit
 * cycle resets — left as TODO stubs here.
 *
 *   pnpm enrich:loop -- --industry=oil_and_gas
 *   pnpm enrich:loop -- --industry=oil_and_gas --dry-run
 *   pnpm enrich:loop -- --tpid=641547
 *   pnpm enrich:loop -- --industry=oil_and_gas --force      # ignore tier cadence
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../.env") });

import { createServiceClient } from "@echelix/db";
import { edgar, news } from "@echelix/connectors";

type Args = {
  industry: string | null;
  sourceIndustry: string | null;
  vertical: string | null;
  statusOverride: string | null;
  tpid: number | null;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    industry: get("industry") ?? null,
    sourceIndustry: get("source-industry") ?? null,
    vertical: get("vertical") ?? null,
    statusOverride: get("status") ?? null,
    tpid: get("tpid") ? Number(get("tpid")) : null,
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    limit: get("limit") ? Number(get("limit")) : null,
  };
}

type AccountRow = {
  id: string;
  tpid: number;
  company_name: string;
  industry: string;
  ticker: string | null;
  tier: "hot" | "warm" | "cold";
  last_researched: string | null;
};

const REFRESH_MAX_AGE_DAYS = { hot: 1, warm: 7, cold: 30 };

function dueForRefresh(row: AccountRow, force: boolean): boolean {
  if (force) return true;
  if (!row.last_researched) return true;
  const ageDays = (Date.now() - new Date(row.last_researched).getTime()) / 86_400_000;
  return ageDays >= REFRESH_MAX_AGE_DAYS[row.tier];
}

type SignalInsert = {
  account_id: string;
  signal_type: "news" | "10k" | "10q" | "earnings" | "leadership" | "other";
  signal_date: string | null;
  headline: string;
  detail: string | null;
  source_url: string | null;
  relevance_tags: string[];
};

async function enrichOne(
  row: AccountRow,
): Promise<{ signals: SignalInsert[]; sources: { news: number; edgar: number } }> {
  const out: SignalInsert[] = [];
  const sources = { news: 0, edgar: 0 };

  // News
  try {
    const items = await news.searchNews(row.company_name, 8);
    sources.news = items.length;
    for (const n of items) {
      const isLeadership = n.tags.includes("leadership") || n.tags.includes("hiring");
      out.push({
        account_id: row.id,
        signal_type: isLeadership ? "leadership" : "news",
        signal_date: n.published_at.slice(0, 10),
        headline: n.headline,
        detail: n.source || null,
        source_url: n.source_url,
        relevance_tags: n.tags,
      });
    }
  } catch (e) {
    console.error(`[enrich] news error ${row.company_name}: ${(e as Error).message}`);
  }

  // EDGAR filings — try resolution regardless of stored ticker (gate hasn't run yet).
  try {
    const hit = await edgar.resolveCompany(row.company_name);
    if (hit) {
        const filings = await edgar.recentFilings(hit.cik, 5);
        sources.edgar = filings.length;
        for (const f of filings) {
          const sig: SignalInsert["signal_type"] =
            f.form === "10-K" ? "10k" : f.form === "10-Q" ? "10q" : "other";
          out.push({
            account_id: row.id,
            signal_type: sig,
            signal_date: f.filing_date,
            headline: `${f.form} filing ${f.report_date ? `for period ${f.report_date}` : ""}`.trim(),
            detail: `Accession ${f.accession}`,
            source_url: f.source_url,
            relevance_tags: [f.form.toLowerCase().replace("-", "")],
          });
        }
      }
  } catch (e) {
    console.error(`[enrich] edgar error ${row.company_name}: ${(e as Error).message}`);
  }

  return { signals: out, sources };
}

function computeTier(signals: SignalInsert[]): "hot" | "warm" | "cold" {
  const now = Date.now();
  let newestDays = Infinity;
  for (const s of signals) {
    if (!s.signal_date) continue;
    const days = (now - new Date(s.signal_date).getTime()) / 86_400_000;
    if (days < newestDays) newestDays = days;
  }
  if (newestDays <= 14) return "hot";
  if (newestDays <= 60) return "warm";
  return "cold";
}

async function main() {
  const args = parseArgs();
  console.log(`[enrich] args=${JSON.stringify(args)}`);

  const supabase = createServiceClient();

  const eligibleStatuses = args.statusOverride
    ? [args.statusOverride]
    : ["active", "pending", "out_of_rotation"];
  const sel = supabase
    .from("accounts")
    .select("id,tpid,company_name,industry,ticker,tier,last_researched")
    .in("status", eligibleStatuses);
  if (args.industry) sel.eq("industry", args.industry);
  if (args.sourceIndustry) sel.eq("source_industry", args.sourceIndustry);
  if (args.vertical) sel.eq("source_vertical", args.vertical);
  if (args.tpid) sel.eq("tpid", args.tpid);
  if (args.limit) sel.limit(args.limit);
  sel.order("company_name", { ascending: true });

  const { data, error } = await sel;
  if (error) throw error;
  const all = (data ?? []) as AccountRow[];
  const due = all.filter((r) => dueForRefresh(r, args.force));
  console.log(`[enrich] ${due.length}/${all.length} due for refresh`);

  let runId: string | null = null;
  if (!args.dryRun) {
    const { data: r, error: re } = await supabase
      .from("run_log")
      .insert({ loop_name: "loop1_enrich", details: { args, due: due.length } })
      .select("id")
      .single();
    if (re) throw re;
    runId = r!.id;
  }

  const totals = {
    accounts: 0,
    signals_written: 0,
    news_items: 0,
    edgar_items: 0,
    promoted_hot: 0,
    promoted_warm: 0,
    demoted_cold: 0,
    errors: 0,
  };
  const samples: Array<Record<string, unknown>> = [];

  for (let i = 0; i < due.length; i++) {
    const row = due[i]!;
    try {
      const { signals, sources } = await enrichOne(row);
      const newTier = computeTier(signals);
      totals.accounts++;
      totals.news_items += sources.news;
      totals.edgar_items += sources.edgar;
      totals.signals_written += signals.length;
      if (newTier === "hot" && row.tier !== "hot") totals.promoted_hot++;
      if (newTier === "warm" && row.tier === "cold") totals.promoted_warm++;
      if (newTier === "cold" && row.tier !== "cold") totals.demoted_cold++;

      if (samples.length < 8) {
        samples.push({
          name: row.company_name,
          ticker: row.ticker,
          news: sources.news,
          edgar: sources.edgar,
          newTier,
          top_signal: signals[0]
            ? {
                type: signals[0].signal_type,
                date: signals[0].signal_date,
                headline: signals[0].headline.slice(0, 80),
                tags: signals[0].relevance_tags,
              }
            : null,
        });
      }

      if (!args.dryRun && signals.length > 0) {
        const { error: insErr } = await supabase.from("signals").insert(signals);
        if (insErr) throw insErr;
        const { error: upErr } = await supabase
          .from("accounts")
          .update({ last_researched: new Date().toISOString(), tier: newTier })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`[enrich] ${i + 1}/${due.length}  signals=${totals.signals_written}`);
      }
    } catch (e) {
      totals.errors++;
      console.error(`[enrich] error ${row.company_name}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[enrich] totals:`);
  for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log(`\n[enrich] sample (first ${samples.length}):`);
  for (const s of samples) console.log(`  ${JSON.stringify(s)}`);

  if (!args.dryRun && runId) {
    await supabase
      .from("run_log")
      .update({
        finished_at: new Date().toISOString(),
        status: totals.errors === 0 ? "ok" : "partial",
        accounts_touched: totals.accounts,
        details: { args, totals, samples },
      })
      .eq("id", runId);
    console.log(`\n[enrich] run_log id=${runId}`);
  } else if (args.dryRun) {
    console.log(`\n[enrich] --dry-run: no signals or tier writes.`);
  }
}

main().catch((e) => {
  console.error("[enrich] FAILED:", e);
  process.exit(1);
});

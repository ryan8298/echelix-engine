/**
 * Stage 3 of the revenue gate — web-search fallback via Claude.
 *
 * Picks up accounts where Stages 1+2 (EDGAR + Apollo) returned no_data_review.
 * Uses Anthropic Messages API with web_search to find a revenue figure from
 * reputable sources, then classifies against the gate band.
 *
 *   pnpm gate:web -- --limit=10        # smoke test
 *   pnpm gate:web                       # full run on no_data_review queue
 *   pnpm gate:web -- --dry-run          # no writes
 *
 * Cost: ~$0.005-0.02 per account (Claude + web search).
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../.env") });

import { createServiceClient } from "@echelix/db";
import { Claude } from "@echelix/connectors";
import { loadConfig, type RevenueBand } from "@echelix/core";

type Args = { dryRun: boolean; limit: number | null; tpid: number | null };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    dryRun: args.includes("--dry-run"),
    limit: get("limit") ? Number(get("limit")) : null,
    tpid: get("tpid") ? Number(get("tpid")) : null,
  };
}

type Verdict = "in_range" | "out_of_range" | "no_data_review";
function classify(amount: number, band: RevenueBand): Verdict {
  const tie = band.tiebreaker_pct;
  if (amount >= band.lower_usd * (1 - tie) && amount <= band.lower_usd * (1 + tie)) return "no_data_review";
  if (amount >= band.upper_usd * (1 - tie) && amount <= band.upper_usd * (1 + tie)) return "no_data_review";
  if (amount < band.lower_usd) return "out_of_range";
  if (amount > band.upper_usd) return "out_of_range";
  return "in_range";
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");
  const sb = createServiceClient();
  const cfg = await loadConfig(sb);
  const claude = new Claude(apiKey);

  let q = sb.from("accounts")
    .select("id, tpid, company_name, domain, industry")
    .eq("status", "pending")
    .eq("revenue_verdict", "no_data_review")
    .neq("industry", "other")
    .order("company_name", { ascending: true });
  if (args.tpid) q = q.eq("tpid", args.tpid);
  if (args.limit) q = q.limit(args.limit);
  const { data: rows, error } = await q;
  if (error) throw error;
  type Row = { id: string; tpid: number; company_name: string; domain: string | null; industry: string };
  const accounts = (rows ?? []) as Row[];
  console.log(`[gate:web] ${accounts.length} accounts to resolve`);

  let runId: string | null = null;
  if (!args.dryRun) {
    const { data, error: re } = await sb.from("run_log")
      .insert({ loop_name: "stage3_web", details: { queued: accounts.length, args } })
      .select("id").single();
    if (re) throw re;
    runId = data!.id;
  }

  const counts = { resolved: 0, unknown: 0, errors: 0, in_range: 0, out_of_range: 0, no_data_review: 0 };
  const samples: Array<Record<string, unknown>> = [];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]!;
    try {
      const r = await claude.findRevenue(acc.company_name, { domain: acc.domain, industry: acc.industry });
      const found = typeof r.revenue_usd === "number" && r.revenue_usd > 0;
      let verdict: Verdict = "no_data_review";
      let newStatus = "pending";
      if (found) {
        counts.resolved++;
        verdict = classify(r.revenue_usd!, cfg.revenue_band);
        counts[verdict]++;
        newStatus = verdict === "in_range" ? "active" : verdict === "out_of_range" ? "out_of_range" : "pending";
      } else {
        counts.unknown++;
      }

      if (samples.length < 10) {
        samples.push({ name: acc.company_name, found, amount: r.revenue_usd, conf: r.confidence, verdict, notes: r.notes.slice(0, 80) });
      }

      if (!args.dryRun) {
        const update: Record<string, unknown> = { last_researched: new Date().toISOString() };
        if (found) {
          update.annual_revenue_usd = r.revenue_usd;
          update.revenue_metric = "estimate";
          update.revenue_confidence = "estimated";
          update.revenue_verdict = verdict;
          update.revenue_source_url = r.source_url;
          update.revenue_as_of = r.fiscal_year ? `${r.fiscal_year}-12-31` : null;
          update.status = newStatus;
        }
        await sb.from("accounts").update(update).eq("id", acc.id);
      }

      if ((i + 1) % 10 === 0) console.log(`[gate:web] ${i + 1}/${accounts.length}  resolved=${counts.resolved} unknown=${counts.unknown}`);
    } catch (e) {
      counts.errors++;
      console.error(`[gate:web] ${acc.company_name}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[gate:web] totals:`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\n[gate:web] sample (first ${samples.length}):`);
  for (const s of samples) console.log(`  ${JSON.stringify(s)}`);

  if (!args.dryRun && runId) {
    await sb.from("run_log").update({
      finished_at: new Date().toISOString(),
      status: counts.errors === 0 ? "ok" : "partial",
      accounts_touched: accounts.length,
      details: { args, counts, samples },
    }).eq("id", runId);
    console.log(`\n[gate:web] run_log id=${runId}`);
  }
}

main().catch((e) => { console.error("[gate:web] FAILED:", e); process.exit(1); });

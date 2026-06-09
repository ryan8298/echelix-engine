/**
 * Loop 2 — Nightly scoring + selection.
 *
 * Per blueprint §6 + user's quality-floor rule.
 *
 *   pnpm select                                     # today's industry, live writes
 *   pnpm select -- --dry-run                        # no writes
 *   pnpm select -- --industry=oil_and_gas           # override calendar
 *   pnpm select -- --date=2026-06-09                # override "today"
 *   pnpm select -- --include-pending                # accept pending accounts (pre-gate)
 *   pnpm select -- --top=5                          # cap (default 5)
 *
 * Outputs: top N picks ranked by total score, with breakdown.
 * Writes: accounts.score, last_surfaced_date, surface_count++ for picks.
 * run_log row with picks + shortfall flag.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../.env") });

import { createServiceClient } from "@echelix/db";
import { industryForDate, loadConfig, scoreAccount, type ScoreBreakdown } from "@echelix/core";

type Args = {
  dryRun: boolean;
  industry: string | null;
  sourceIndustry: string | null;
  vertical: string | null;
  statusOverride: string | null;
  date: Date;
  includePending: boolean;
  top: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    dryRun: args.includes("--dry-run"),
    industry: get("industry") ?? null,
    sourceIndustry: get("source-industry") ?? null,
    vertical: get("vertical") ?? null,
    statusOverride: get("status") ?? null,
    date: get("date") ? new Date(get("date")!) : new Date(),
    includePending: args.includes("--include-pending"),
    top: get("top") ? Number(get("top")) : 5,
  };
}

type AccountRow = {
  id: string;
  tpid: number;
  company_name: string;
  industry: string;
  microsoft_team: Record<string, unknown> | null;
  last_surfaced_date: string | null;
  status: string;
};

type SignalRow = {
  account_id: string;
  signal_type: string;
  signal_date: string | null;
  relevance_tags: string[] | null;
};

async function main() {
  const args = parseArgs();
  const supabase = createServiceClient();
  const cfg = await loadConfig(supabase);
  // If any custom filter is set, treat that as the targeting basis. Otherwise
  // fall back to the calendar rotation industry.
  const hasCustomFilter = args.sourceIndustry || args.vertical || args.statusOverride;
  const industry = args.industry ?? (hasCustomFilter ? null : industryForDate(args.date, cfg.rotation));
  if (!industry && !hasCustomFilter) {
    console.log(`[select] no rotation industry for ${args.date.toDateString()} (weekend or unmapped) — exiting.`);
    return;
  }
  console.log(`[select] industry=${industry ?? "(custom filter)"} source_industry=${args.sourceIndustry ?? "*"} vertical=${args.vertical ?? "*"} status=${args.statusOverride ?? "(default)"} date=${args.date.toISOString().slice(0, 10)} top=${args.top}`);

  const eligibleStatuses = args.statusOverride
    ? [args.statusOverride]
    : args.includePending
      ? ["active", "pending", "out_of_rotation"]
      : ["active"];
  let q = supabase
    .from("accounts")
    .select("id,tpid,company_name,industry,microsoft_team,last_surfaced_date,status")
    .in("status", eligibleStatuses);
  if (industry) q = q.eq("industry", industry);
  if (args.sourceIndustry) q = q.eq("source_industry", args.sourceIndustry);
  if (args.vertical) q = q.eq("source_vertical", args.vertical);
  const { data: accountsData, error: ae } = await q;
  if (ae) throw ae;
  const accounts = (accountsData ?? []) as AccountRow[];
  console.log(`[select] ${accounts.length} candidate accounts (status in [${eligibleStatuses.join(",")}])`);

  if (accounts.length === 0) {
    console.log(`[select] no candidates — exiting.`);
    return;
  }

  // Pull all signals for these accounts in one query.
  const accountIds = accounts.map((a) => a.id);
  const { data: signalsData, error: se } = await supabase
    .from("signals")
    .select("account_id,signal_type,signal_date,relevance_tags")
    .in("account_id", accountIds);
  if (se) throw se;
  const signals = (signalsData ?? []) as SignalRow[];

  const signalsByAccount = new Map<string, SignalRow[]>();
  for (const s of signals) {
    if (!signalsByAccount.has(s.account_id)) signalsByAccount.set(s.account_id, []);
    signalsByAccount.get(s.account_id)!.push(s);
  }

  // Score everyone.
  type Scored = {
    account: AccountRow;
    breakdown: ScoreBreakdown;
    signal_count: number;
  };
  const scored: Scored[] = accounts.map((a) => {
    const accountSignals = (signalsByAccount.get(a.id) ?? []).map((s) => ({
      signal_type: s.signal_type,
      signal_date: s.signal_date,
      relevance_tags: s.relevance_tags ?? [],
    }));
    const breakdown = scoreAccount({
      signals: accountSignals,
      microsoft_team: a.microsoft_team,
      last_surfaced_date: a.last_surfaced_date,
      now: args.date,
      tuning: {
        weights: cfg.scoring_weights,
        quality_floor: cfg.quality_floor,
        cooldown_days: cfg.cooldown_days,
      },
    });
    return { account: a, breakdown, signal_count: accountSignals.length };
  });

  scored.sort((a, b) => b.breakdown.total - a.breakdown.total);

  const eligible = scored.filter((s) => s.breakdown.eligible);
  const picks = eligible.slice(0, args.top);
  const shortfall = picks.length < args.top;

  console.log(`\n[select] full ranking (top 10 shown):`);
  console.log(`${"rank".padEnd(5)} ${"score".padEnd(7)} ${"elig".padEnd(5)} ${"sigs".padEnd(5)} ${"fresh".padEnd(6)} ${"rel".padEnd(5)} ${"trig".padEnd(5)} ${"msfit".padEnd(6)} ${"name"}`);
  for (let i = 0; i < Math.min(10, scored.length); i++) {
    const s = scored[i]!;
    const b = s.breakdown;
    const tag = b.eligible ? "✓" : "✗";
    console.log(
      `${String(i + 1).padEnd(5)} ${b.total.toFixed(1).padEnd(7)} ${tag.padEnd(5)} ${String(s.signal_count).padEnd(5)} ${b.freshness.toFixed(2).padEnd(6)} ${b.relevance.toFixed(2).padEnd(5)} ${b.triggers.toFixed(2).padEnd(5)} ${b.ms_fit.toFixed(2).padEnd(6)} ${s.account.company_name}${b.reason_ineligible ? `  (${b.reason_ineligible})` : ""}`,
    );
  }

  console.log(`\n[select] picks (${picks.length}/${args.top}):`);
  for (const p of picks) {
    console.log(`  ${p.account.company_name.padEnd(40)} score=${p.breakdown.total.toFixed(1)} signals=${p.signal_count}`);
  }
  if (shortfall) {
    console.log(`\n[select] ⚠ SHORTFALL: only ${picks.length} accounts cleared the quality floor (freshness>=0.4 AND relevance>=0.3). Not padding.`);
  }

  if (args.dryRun) {
    console.log(`\n[select] --dry-run: no writes.`);
    return;
  }

  // Write picks: score, last_surfaced_date, surface_count++
  // For non-picks: write score only (so we can see the full distribution in DB).
  const today = args.date.toISOString().slice(0, 10);
  const pickIds = new Set(picks.map((p) => p.account.id));

  // First, update score on everyone scored (cheap).
  for (const s of scored) {
    await supabase
      .from("accounts")
      .update({ score: Number(s.breakdown.total.toFixed(2)) })
      .eq("id", s.account.id);
  }
  // Then bump surface_count + last_surfaced_date for picks only.
  if (picks.length > 0) {
    // Fetch current surface_count to increment correctly.
    const { data: existing, error: ge } = await supabase
      .from("accounts")
      .select("id,surface_count")
      .in("id", [...pickIds]);
    if (ge) throw ge;
    const countMap = new Map((existing ?? []).map((r) => [r.id as string, r.surface_count as number]));
    for (const id of pickIds) {
      await supabase
        .from("accounts")
        .update({
          last_surfaced_date: today,
          surface_count: (countMap.get(id) ?? 0) + 1,
        })
        .eq("id", id);
    }

    // Insert briefs rows for each pick (queue for skill generation).
    const briefRows = picks.map((p) => ({
      account_id: p.account.id,
      brief_date: today,
      status: "draft" as const,
      score_at_pick: Number(p.breakdown.total.toFixed(2)),
    }));
    const { error: bErr } = await supabase.from("briefs").upsert(briefRows, {
      onConflict: "account_id,brief_date",
    });
    if (bErr) throw bErr;
  }

  const { data: runRow, error: re } = await supabase
    .from("run_log")
    .insert({
      loop_name: "loop2_select",
      finished_at: new Date().toISOString(),
      status: "ok",
      accounts_touched: scored.length,
      details: {
        args,
        industry,
        candidate_count: accounts.length,
        eligible_count: eligible.length,
        picks: picks.map((p) => ({
          tpid: p.account.tpid,
          name: p.account.company_name,
          score: Number(p.breakdown.total.toFixed(2)),
          breakdown: p.breakdown,
        })),
        shortfall,
      },
    })
    .select("id")
    .single();
  if (re) throw re;
  console.log(`\n[select] run_log id=${runRow!.id}`);
}

main().catch((e) => {
  console.error("[select] FAILED:", e);
  process.exit(1);
});

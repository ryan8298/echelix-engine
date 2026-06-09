/**
 * Load 2,500-account Excel into Supabase `accounts`.
 *
 * Reads the source workbook, normalizes Industry from the granular Vertical column
 * via @echelix/core, preserves the Microsoft account team contacts as JSON,
 * and upserts on TPID.
 *
 *   pnpm load:accounts -- --dry-run     # report only, no writes
 *   pnpm load:accounts                  # upsert rows
 *   pnpm load:accounts -- --file=/path  # override ACCOUNTS_XLSX_PATH
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../.env") });
import ExcelJS from "exceljs";
import { createServiceClient } from "@echelix/db";
import { loadConfig, normalizeIndustryFromMap } from "@echelix/core";

type Args = { dryRun: boolean; file: string };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((a) => a.startsWith("--file="));
  const file =
    fileArg?.slice("--file=".length) ??
    process.env.ACCOUNTS_XLSX_PATH ??
    "";
  if (!file) {
    throw new Error("No source file. Pass --file=<path> or set ACCOUNTS_XLSX_PATH.");
  }
  return { dryRun, file };
}

// Header → column index map, built from row 1.
function buildHeaderMap(headerRow: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const v = cell.value;
    if (typeof v === "string") map.set(v.trim(), col);
  });
  return map;
}

function cellStr(row: ExcelJS.Row, col: number | undefined): string | null {
  if (!col) return null;
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).trim() || null;
  return String(v).trim() || null;
}

function cellNum(row: ExcelJS.Row, col: number | undefined): number | null {
  if (!col) return null;
  const v = row.getCell(col).value;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
}

async function main() {
  const { dryRun, file } = parseArgs();
  console.log(`[loader] file=${file} dryRun=${dryRun}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  // Identify the primary data sheet: the first worksheet that has both TPID
  // and Account Name headers. Other data-shaped sheets (e.g. filtered views
  // like "Sheet2 Texas") are reported but skipped — they're typically subsets.
  const allDataSheets = wb.worksheets.filter((w) => {
    const h = buildHeaderMap(w.getRow(1));
    return h.has("TPID") && h.has("Account Name");
  });
  if (allDataSheets.length === 0) throw new Error("No data worksheets (need TPID + Account Name columns)");
  const ws = allDataSheets[0]!;
  if (allDataSheets.length > 1) {
    console.log(`[loader] primary sheet: ${ws.name} (${ws.rowCount} rows). Skipping additional data sheets: ${allDataSheets.slice(1).map((s) => `${s.name}(${s.rowCount})`).join(", ")}`);
  } else {
    console.log(`[loader] sheet="${ws.name}" rows~${ws.rowCount}`);
  }
  const headers = buildHeaderMap(ws.getRow(1));
  const col = {
    tpid: headers.get("TPID"),
    name: headers.get("Account Name"),
    industry: headers.get("Industry"),
    vertical: headers.get("Vertical"),
    address: headers.get("Account Address"),
    city: headers.get("Account City"),
    state: headers.get("Account State"),
    zip: headers.get("Account Zip Code"),
    // MS account team
    aeName: headers.get("AE Name"),
    aeEmail: headers.get("AE Email Alias"),
    atsName: headers.get("ATS Name"),
    atsEmail: headers.get("ATS Email Alias"),
    indLeadName: headers.get("Industry Leader Name"),
    indLeadEmail: headers.get("Industry Leader Email Alias"),
    stuCloudName: headers.get("STU - Cloud & AI Name"),
    stuCloudEmail: headers.get("STU - Cloud & AI Email Alias"),
    stuSecName: headers.get("STU - Security Name"),
    stuSecEmail: headers.get("STU - Security Email Alias"),
    stuBizName: headers.get("STU - AI Biz, Biz Process Name"),
    stuBizEmail: headers.get("STU - AI Biz, Biz Process Email Alias"),
    stuWfName: headers.get("STU - AI Biz, Workforce AI Name"),
    stuWfEmail: headers.get("STU - AI Biz, Workforce AI Email Alias"),
    segment: headers.get("Segment"),
    subSegment: headers.get("Sub Segment"),
    operatingUnit: headers.get("Operating Unit"),
  };
  if (!col.tpid || !col.name) {
    throw new Error(`Required columns missing. Found headers: ${[...headers.keys()].join(", ")}`);
  }

  const supabase = createServiceClient();
  const cfg = await loadConfig(supabase);
  console.log(`[loader] config: ${Object.keys(cfg.industry_map).length} industries mapped, rotation=${JSON.stringify(cfg.rotation)}`);

  const rows: Array<Record<string, unknown>> = [];
  const bucketCounts = new Map<string, number>();
  const unmappedVerticals = new Map<string, number>();
  let skipped = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const tpid = cellNum(row, col.tpid);
    const name = cellStr(row, col.name);
    if (!tpid || !name) { skipped++; continue; }

    const sourceVertical = cellStr(row, col.vertical);
    const sourceIndustry = cellStr(row, col.industry);
    // Bucket by Industry (column Y), not Vertical (column Z). Industry is the
    // less-granular classifier you actually edit in /settings.
    const bucket = normalizeIndustryFromMap(sourceIndustry, cfg.industry_map);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    if (bucket === "other" && sourceIndustry) {
      unmappedVerticals.set(sourceIndustry, (unmappedVerticals.get(sourceIndustry) ?? 0) + 1);
    }

    const city = cellStr(row, col.city);
    const state = cellStr(row, col.state);
    const hqLocation = [city, state].filter(Boolean).join(", ") || null;

    const msTeam = {
      ae: { name: cellStr(row, col.aeName), email_alias: cellStr(row, col.aeEmail) },
      ats: { name: cellStr(row, col.atsName), email_alias: cellStr(row, col.atsEmail) },
      industry_leader: { name: cellStr(row, col.indLeadName), email_alias: cellStr(row, col.indLeadEmail) },
      stu_cloud_ai: { name: cellStr(row, col.stuCloudName), email_alias: cellStr(row, col.stuCloudEmail) },
      stu_security: { name: cellStr(row, col.stuSecName), email_alias: cellStr(row, col.stuSecEmail) },
      stu_ai_biz_process: { name: cellStr(row, col.stuBizName), email_alias: cellStr(row, col.stuBizEmail) },
      stu_ai_workforce: { name: cellStr(row, col.stuWfName), email_alias: cellStr(row, col.stuWfEmail) },
      segment: cellStr(row, col.segment),
      sub_segment: cellStr(row, col.subSegment),
      operating_unit: cellStr(row, col.operatingUnit),
    };

    rows.push({
      tpid,
      company_name: name,
      industry: bucket === "other" ? "other" : bucket,
      source_industry: sourceIndustry,
      source_vertical: sourceVertical,
      hq_address: cellStr(row, col.address),
      hq_city: city,
      hq_state: state,
      hq_zip: cellStr(row, col.zip),
      hq_location: hqLocation,
      microsoft_team: msTeam,
      status: bucket === "other" ? "out_of_rotation" : "pending",
    });
  }

  console.log(`\n[loader] parsed ${rows.length} rows (skipped ${skipped})`);
  console.log(`\n[loader] industry bucket distribution:`);
  for (const [b, n] of [...bucketCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${b}`);
  }
  if (unmappedVerticals.size) {
    console.log(`\n[loader] unmapped verticals (→ status=out_of_rotation):`);
    for (const [v, n] of [...unmappedVerticals.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${v}`);
    }
  }

  if (dryRun) {
    console.log(`\n[loader] --dry-run: no writes. exiting.`);
    return;
  }

  // run_log start
  const { data: runRow, error: runErr } = await supabase
    .from("run_log")
    .insert({ loop_name: "loader", details: { file, rows: rows.length } })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = runRow!.id;

  // Split into "new" (full insert with default status) and "existing"
  // (update only spreadsheet-sourced fields — preserve gate verdict, score,
  // tier, last_surfaced_date, surface_count, last_researched, etc.).
  const tpids = rows.map((r) => r.tpid as number);
  const existingTpids = new Set<number>();
  const CHUNK = 1000;
  for (let i = 0; i < tpids.length; i += CHUNK) {
    const chunk = tpids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("accounts").select("tpid").in("tpid", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ tpid: number }>) existingTpids.add(r.tpid);
  }

  const PRESERVE = new Set([
    "status", "revenue_verdict", "annual_revenue_usd", "revenue_metric",
    "revenue_confidence", "revenue_as_of", "revenue_source_url",
    "score", "tier", "last_surfaced_date", "surface_count", "last_researched",
    "ticker", "domain",
  ]);

  const toInsert = rows.filter((r) => !existingTpids.has(r.tpid as number));
  const toUpdate = rows.filter((r) => existingTpids.has(r.tpid as number))
    .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !PRESERVE.has(k))));

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await supabase.from("accounts").insert(chunk);
    if (error) {
      await supabase.from("run_log").update({
        finished_at: new Date().toISOString(),
        status: "error",
        accounts_touched: inserted,
        error_message: error.message,
      }).eq("id", runId);
      throw error;
    }
    inserted += chunk.length;
    console.log(`[loader] inserted ${inserted}/${toInsert.length}`);
  }

  let updated = 0;
  for (const row of toUpdate) {
    const { error } = await supabase.from("accounts").update(row).eq("tpid", row.tpid);
    if (error) {
      await supabase.from("run_log").update({
        finished_at: new Date().toISOString(),
        status: "error",
        accounts_touched: inserted + updated,
        error_message: error.message,
      }).eq("id", runId);
      throw error;
    }
    updated++;
    if (updated % 500 === 0) console.log(`[loader] updated ${updated}/${toUpdate.length}`);
  }
  const touched = inserted + updated;

  await supabase.from("run_log").update({
    finished_at: new Date().toISOString(),
    status: "ok",
    accounts_touched: touched,
    details: {
      file,
      rows: rows.length,
      inserted,
      updated,
      buckets: Object.fromEntries(bucketCounts),
      unmapped_verticals: Object.fromEntries(unmappedVerticals),
    },
  }).eq("id", runId);

  console.log(`\n[loader] done. ${inserted} new + ${updated} updated (status/revenue/score preserved on existing). run_log id=${runId}`);
}

main().catch((e) => {
  console.error("[loader] FAILED:", e);
  process.exit(1);
});

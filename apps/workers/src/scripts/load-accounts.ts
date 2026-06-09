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
import { normalizeIndustry, type RotationBucket } from "@echelix/core";

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
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No worksheet found in workbook");
  console.log(`[loader] sheet="${ws.name}" rows~${ws.rowCount}`);

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

  const rows: Array<Record<string, unknown>> = [];
  const bucketCounts = new Map<RotationBucket, number>();
  const unmappedVerticals = new Map<string, number>();
  let skipped = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const tpid = cellNum(row, col.tpid);
    const name = cellStr(row, col.name);
    if (!tpid || !name) { skipped++; continue; }

    const sourceVertical = cellStr(row, col.vertical);
    const sourceIndustry = cellStr(row, col.industry);
    const bucket = normalizeIndustry(sourceVertical);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    if (bucket === "other" && sourceVertical) {
      unmappedVerticals.set(sourceVertical, (unmappedVerticals.get(sourceVertical) ?? 0) + 1);
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

  const supabase = createServiceClient();

  // run_log start
  const { data: runRow, error: runErr } = await supabase
    .from("run_log")
    .insert({ loop_name: "loader", details: { file, rows: rows.length } })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = runRow!.id;

  // Upsert in chunks on tpid.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("accounts").upsert(chunk, { onConflict: "tpid" });
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
    console.log(`[loader] upserted ${inserted}/${rows.length}`);
  }

  await supabase.from("run_log").update({
    finished_at: new Date().toISOString(),
    status: "ok",
    accounts_touched: inserted,
    details: {
      file,
      rows: rows.length,
      buckets: Object.fromEntries(bucketCounts),
      unmapped_verticals: Object.fromEntries(unmappedVerticals),
    },
  }).eq("id", runId);

  console.log(`\n[loader] done. ${inserted} rows upserted. run_log id=${runId}`);
}

main().catch((e) => {
  console.error("[loader] FAILED:", e);
  process.exit(1);
});

/**
 * SEC EDGAR connector — free, no key required, requires a User-Agent header.
 *
 * Flow:
 *   1. Load company_tickers.json once (cached on disk).
 *   2. Normalize the source company name and match against EDGAR titles.
 *   3. If matched, hit Company Facts API and extract most recent annual revenue.
 *
 * EDGAR's annual revenue concept varies across companies. We try a prioritized
 * list of XBRL concepts and take the first one that yields a fiscal-year (FY)
 * filing within the last 24 months.
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const UA = "Echelix Engine ryan@echelix.local";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const CACHE_DIR = join(tmpdir(), "echelix-edgar");
const TICKERS_CACHE = join(CACHE_DIR, "company_tickers.json");
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

export type EdgarHit = {
  cik: string;          // zero-padded 10-digit
  ticker: string;
  edgar_title: string;
};

export type EdgarRevenue = {
  amount_usd: number;
  fiscal_year: number;
  fiscal_period: string;   // FY
  end_date: string;        // YYYY-MM-DD
  concept: string;         // which XBRL concept produced the figure
  form: string;            // 10-K, 10-K/A
  source_url: string;
};

let tickersIndex: TickerIndex | null = null;

type TickerIndex = {
  byNormalizedName: Map<string, EdgarHit>;
  raw: EdgarHit[];
};

/** Normalize for matching: uppercase, drop legal suffixes & punctuation. */
export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,&'`"()]/g, " ")
    .replace(
      /\b(CORPORATION|CORP|INCORPORATED|INC|COMPANY|CO|LIMITED|LTD|LLC|LLP|PLC|HOLDINGS|HOLDING|GROUP|THE)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureFresh(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

async function loadTickers(): Promise<TickerIndex> {
  if (tickersIndex) return tickersIndex;

  await mkdir(CACHE_DIR, { recursive: true });
  let json: string;
  if (await ensureFresh(TICKERS_CACHE)) {
    json = await readFile(TICKERS_CACHE, "utf8");
  } else {
    const res = await fetch(TICKERS_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`EDGAR tickers fetch failed: ${res.status}`);
    json = await res.text();
    await writeFile(TICKERS_CACHE, json);
  }
  const data = JSON.parse(json) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;

  const raw: EdgarHit[] = Object.values(data).map((v) => ({
    cik: String(v.cik_str).padStart(10, "0"),
    ticker: v.ticker,
    edgar_title: v.title,
  }));

  const byNormalizedName = new Map<string, EdgarHit>();
  // Prefer earlier (lower CIK / older filer) on collision — bigger/older entities
  // usually have lower CIK. For our purposes either is fine; we'll detect ambiguity.
  for (const hit of raw) {
    const k = normalizeName(hit.edgar_title);
    if (!byNormalizedName.has(k)) byNormalizedName.set(k, hit);
  }

  tickersIndex = { byNormalizedName, raw };
  return tickersIndex;
}

/**
 * Match a source company name to an EDGAR filer.
 * Returns null on no match or ambiguous matches.
 */
export async function resolveCompany(sourceName: string): Promise<EdgarHit | null> {
  const idx = await loadTickers();
  const norm = normalizeName(sourceName);
  if (!norm) return null;

  const exact = idx.byNormalizedName.get(norm);
  if (exact) return exact;

  // Substring fallback: source name contains EDGAR title or vice versa,
  // but only when the matched-side is a meaningful word (>= 4 chars after norm).
  const candidates: EdgarHit[] = [];
  for (const hit of idx.raw) {
    const t = normalizeName(hit.edgar_title);
    if (t.length < 4) continue;
    if (norm === t) return hit;
    if (norm.startsWith(t + " ") || t.startsWith(norm + " ")) candidates.push(hit);
  }
  // Only accept substring match if unambiguous.
  if (candidates.length === 1) return candidates[0]!;
  return null;
}

const REVENUE_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
];

type CompanyFacts = {
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        units?: {
          USD?: Array<{
            val: number;
            fy: number;
            fp: string;
            end: string;
            form: string;
            filed: string;
          }>;
        };
      }
    >;
  };
};

export type EdgarFiling = {
  form: string;
  filing_date: string;   // YYYY-MM-DD
  report_date: string;   // period the filing covers (may be empty)
  accession: string;
  source_url: string;
};

/**
 * Pull recent filings (10-K, 10-Q, 8-K) for a CIK from EDGAR submissions API.
 * Returns up to `max` most recent, sorted by filing_date desc.
 */
export async function recentFilings(cik: string, max = 5): Promise<EdgarFiling[]> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`EDGAR submissions ${cik}: ${res.status}`);
  }
  const data = (await res.json()) as {
    filings?: {
      recent?: {
        form?: string[];
        filingDate?: string[];
        reportDate?: string[];
        accessionNumber?: string[];
      };
    };
  };
  const r = data.filings?.recent;
  if (!r?.form || !r.filingDate || !r.accessionNumber) return [];
  const out: EdgarFiling[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i]!;
    if (form !== "10-K" && form !== "10-Q" && form !== "8-K") continue;
    const accession = r.accessionNumber[i]!.replace(/-/g, "");
    out.push({
      form,
      filing_date: r.filingDate[i]!,
      report_date: r.reportDate?.[i] ?? "",
      accession,
      source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form}&dateb=&owner=include&count=10`,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Pull most recent FY annual revenue from EDGAR Company Facts. */
export async function fetchAnnualRevenue(cik: string): Promise<EdgarRevenue | null> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`EDGAR companyfacts ${cik}: ${res.status}`);
  }
  const data = (await res.json()) as CompanyFacts;
  const usGaap = data.facts?.["us-gaap"];
  if (!usGaap) return null;

  for (const concept of REVENUE_CONCEPTS) {
    const series = usGaap[concept]?.units?.USD;
    if (!series) continue;
    const fy = series
      .filter((p) => p.fp === "FY" && (p.form === "10-K" || p.form === "10-K/A"))
      .sort((a, b) => (a.end < b.end ? 1 : -1));
    const latest = fy[0];
    if (!latest) continue;
    return {
      amount_usd: latest.val,
      fiscal_year: latest.fy,
      fiscal_period: latest.fp,
      end_date: latest.end,
      concept,
      form: latest.form,
      source_url: url,
    };
  }
  return null;
}

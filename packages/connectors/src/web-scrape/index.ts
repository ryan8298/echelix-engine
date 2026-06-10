/**
 * Website scraper — extract signals from public company pages.
 * Crawls: careers, about, press/news, investor relations.
 * Yields job postings, company updates, financial mentions.
 */

export type WebSignal = {
  category: "job_posting" | "company_update" | "financial_mention";
  headline: string;
  detail: string | null;
  url: string;
  tags: string[];
};

async function fetchAndParse(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EchelixBot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const JOB_TITLE_KEYWORDS = [
  "ai engineer", "ml engineer", "machine learning", "data engineer", "data scientist",
  "ai researcher", "nlp engineer", "llm", "generative ai", "prompt engineer",
  "ai program manager", "head of ai", "director of ai", "chief ai",
];

function extractJobPostings(html: string, url: string): WebSignal[] {
  const signals: WebSignal[] = [];
  // Simple heuristic: look for job titles in the page
  for (const keyword of JOB_TITLE_KEYWORDS) {
    const re = new RegExp(keyword, "gi");
    const matches = html.match(re);
    if (matches && matches.length > 0) {
      signals.push({
        category: "job_posting",
        headline: `Open role: ${keyword}`,
        detail: null,
        url,
        tags: ["hiring", keyword.toLowerCase().replace(/\s+/g, "_")],
      });
    }
  }
  return signals;
}

function extractFinancialMentions(html: string, url: string): WebSignal[] {
  const signals: WebSignal[] = [];
  const patterns = [
    { re: /capex|capital expenditure|capital investment/gi, tag: "capex" },
    { re: /plant modernization|smart factory|industry 4/gi, tag: "modernization" },
    { re: /sustainability|esg|net zero/gi, tag: "sustainability" },
    { re: /digital transformation|ai transformation/gi, tag: "modernization" },
  ];
  for (const { re, tag } of patterns) {
    if (re.test(html)) {
      signals.push({
        category: "financial_mention",
        headline: `Mentioned: ${tag}`,
        detail: null,
        url,
        tags: [tag],
      });
    }
  }
  return signals;
}

function extractCompanyUpdates(html: string, url: string): WebSignal[] {
  const signals: WebSignal[] = [];
  // Look for key organizational patterns
  const patterns = [
    { re: /new (ceo|cfo|cto|cio|cdo|chief)/gi, tag: "leadership_change" },
    { re: /appoint|appointed (as )?chief/gi, tag: "leadership_change" },
    { re: /acquisition|acquired|merger/gi, tag: "ma" },
  ];
  for (const { re, tag } of patterns) {
    if (re.test(html)) {
      signals.push({
        category: "company_update",
        headline: `Signal: ${tag}`,
        detail: null,
        url,
        tags: [tag],
      });
    }
  }
  return signals;
}

export async function scrapeCompanyPages(domain: string): Promise<WebSignal[]> {
  const allSignals: WebSignal[] = [];
  const urls = [
    `https://${domain}/careers`,
    `https://${domain}/about`,
    `https://${domain}/news`,
    `https://${domain}/press`,
    `https://${domain}/investor-relations`,
    `https://${domain}/investors`,
  ];

  for (const url of urls) {
    const html = await fetchAndParse(url);
    if (!html) continue;

    allSignals.push(...extractJobPostings(html, url));
    allSignals.push(...extractFinancialMentions(html, url));
    allSignals.push(...extractCompanyUpdates(html, url));
  }

  // Deduplicate by headline + category
  const seen = new Set<string>();
  const unique: WebSignal[] = [];
  for (const s of allSignals) {
    const key = `${s.category}:${s.headline}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  return unique;
}

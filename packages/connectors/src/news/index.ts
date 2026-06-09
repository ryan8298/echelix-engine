/**
 * News RSS connector — Google News RSS, free, no auth.
 *
 * Returns up to N most recent items for a company name. Light keyword tagger
 * applies the relevance_tags vocabulary the blueprint calls out:
 *   {azure, microsoft, hiring, capex, ma, leadership, integration, greenfield}
 */

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

export type NewsItem = {
  headline: string;
  source_url: string;
  published_at: string;     // ISO
  source: string;           // e.g. "Reuters"
  tags: string[];
};

const TAG_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "microsoft", re: /\b(microsoft|azure|fabric|openai|copilot|m365|sharepoint)\b/i },
  { tag: "azure",     re: /\b(azure|microsoft cloud)\b/i },
  { tag: "hiring",    re: /\b(hires?|hiring|appoint(s|ed|ment)?|named (as )?(chief|ceo|cfo|cto|cio)|new (ceo|cfo|cto|cio|president|vp|vice president|chief))\b/i },
  { tag: "leadership", re: /\b(ceo|cfo|cto|cio|president|chief (executive|financial|technology|information|operating) officer|board of directors|chair(man|woman|person)?)\b/i },
  { tag: "capex",     re: /\b(capex|capital (expenditure|investment|spend(ing)?)|invests? \$|investing \$|\$[\d.]+ ?[bm](illion)?\b)/i },
  { tag: "ma",        re: /\b(acquir(es|ed|ing|ition)|merger|merge[sd]?|buy(s|out)|bought|sell(s|ing)?|sold|divest(s|ed|iture)|business unit|spin[- ]?off)\b/i },
  { tag: "greenfield", re: /\b(greenfield|new (plant|facility|refinery|terminal|site)|breaks ground|construction|build(s|ing) (a )?new)\b/i },
  { tag: "integration", re: /\b(integrat(es|ion|ing)|connector|partnership with|partners with|joint venture)\b/i },
  { tag: "earnings",  re: /\b(earnings|q[1-4] [12][09]\d{2}|quarter(ly)? results?|reports? (q[1-4]|earnings|revenue))\b/i },
];

function applyTags(headline: string): string[] {
  const tags = new Set<string>();
  for (const { tag, re } of TAG_RULES) if (re.test(headline)) tags.add(tag);
  return [...tags];
}

/** Minimal XML extraction — no full parser, just regex on item/title/link/pubDate. */
function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1]!;
    const title = body.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const link = body.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
    const pub = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim();
    const source = body.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "";
    if (!title || !link) continue;
    let publishedISO: string;
    try {
      publishedISO = pub ? new Date(pub).toISOString() : new Date().toISOString();
    } catch {
      publishedISO = new Date().toISOString();
    }
    items.push({
      headline: title,
      source_url: link,
      published_at: publishedISO,
      source,
      tags: applyTags(title),
    });
  }
  return items;
}

export async function searchNews(companyName: string, max = 8): Promise<NewsItem[]> {
  const q = encodeURIComponent(`"${companyName}"`);
  const url = `${GOOGLE_NEWS_RSS}?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Echelix Engine ryan@echelix.local" },
  });
  if (!res.ok) throw new Error(`news rss ${companyName}: ${res.status}`);
  const xml = await res.text();
  return parseRss(xml).slice(0, max);
}

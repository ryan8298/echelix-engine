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
  // Microsoft / Echelix-stack ecosystem
  { tag: "microsoft", re: /\b(microsoft|azure|fabric|openai|copilot|m365|sharepoint|dynamics)\b/i },
  { tag: "azure",     re: /\b(azure|microsoft cloud)\b/i },
  { tag: "copilot",   re: /\b(copilot|m365 copilot|copilot for (?:sales|finance|service))\b/i },
  { tag: "fabric",    re: /\b(microsoft fabric|fabric capacity|fabric f\d+)\b/i },
  { tag: "foundry",   re: /\b(azure foundry|ai foundry|foundry agent service)\b/i },
  { tag: "m365",      re: /\b(microsoft 365|m365 e[35]|sharepoint|teams|d365)\b/i },
  // Disqualifier flags
  { tag: "aws_primary", re: /\b(aws[- ]first|aws[- ]primary|all[- ]in on aws|amazon web services preferred)\b/i },
  { tag: "gcp_primary", re: /\b(gcp[- ]first|gcp[- ]primary|google cloud preferred|all[- ]in on google cloud)\b/i },
  // Leadership / hiring
  { tag: "leadership", re: /\b(ceo|cfo|cto|cio|cdo|president|chief (executive|financial|technology|information|operating|digital|data) officer|board of directors|chair(man|woman|person)?)\b/i },
  { tag: "leadership_change", re: /\b(new (cio|coo|cto|cdo|cfo|ceo)|appointed (chief|president|vp)|hires? new (chief|head of)|names? new (cio|coo|cto|cdo|ceo))\b/i },
  { tag: "ai_hiring", re: /\b(ai engineer|machine learning engineer|ml engineer|ai program manager|head of ai|chief ai|director of ai|director of data)\b/i },
  { tag: "hiring",    re: /\b(hires?|hiring|appoint(s|ed|ment)?|named (as )?(chief|ceo|cfo|cto|cio)|new (ceo|cfo|cto|cio|president|vp|vice president|chief))\b/i },
  // Operational signals (ICP Tier A)
  { tag: "throughput", re: /\b(throughput|downtime|oee|overall equipment effectiveness|sla|capacity utilization|real[- ]time visibility)\b/i },
  { tag: "compliance", re: /\b(compliance|regulatory|sox compliance|gdpr|hipaa|audit ready|fda)\b/i },
  { tag: "modernization", re: /\b(plant modernization|digital transformation|smart factory|industry 4|refinery of the future|factory of the future|grid modernization)\b/i },
  // Capex / M&A / business events
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

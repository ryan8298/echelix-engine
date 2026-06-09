/**
 * Anthropic Claude connector — wraps the Messages API with web_search tool.
 * Used for: Stage 3 revenue resolution, email drafting v2, account chat (later).
 */

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6"; // good cost/quality balance

export type ClaudeRevenueLookup = {
  revenue_usd: number | null;
  fiscal_year: number | null;
  source_url: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
  notes: string;
};

export class Claude {
  private client: Anthropic;
  constructor(apiKey: string, private model = DEFAULT_MODEL) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Find a company's most recent annual revenue via web search + structured output.
   * Returns { revenue_usd, fiscal_year, source_url, confidence, notes }.
   */
  async findRevenue(companyName: string, hint?: { domain?: string | null; industry?: string | null }): Promise<ClaudeRevenueLookup> {
    const hintLines = [
      hint?.domain ? `Their primary domain is ${hint.domain}.` : "",
      hint?.industry ? `Industry: ${hint.industry}.` : "",
    ].filter(Boolean).join(" ");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 4 },
        {
          name: "report_revenue",
          description: "Report the company's most recent annual revenue findings. Use this at the end of your search.",
          input_schema: {
            type: "object",
            properties: {
              revenue_usd: { type: ["number", "null"], description: "Annual revenue in USD. Null if not found." },
              fiscal_year: { type: ["integer", "null"], description: "The fiscal year the figure covers" },
              source_url: { type: ["string", "null"], description: "URL of the most authoritative source used" },
              confidence: { type: "string", enum: ["high", "medium", "low", "unknown"] },
              notes: { type: "string", description: "Brief explanation: e.g. 'subsidiary of X, no standalone disclosure' or 'private — Forbes lists revenue at $XB'" },
            },
            required: ["revenue_usd", "confidence", "notes"],
          },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            `Find the most recent annual revenue (in USD) for the company "${companyName}". ${hintLines}\n\n` +
            `Search reputable sources only (the company's own IR/press page, news outlets like Reuters/Bloomberg/WSJ, ` +
            `Forbes lists, Crunchbase, ZoomInfo summaries, etc.). Avoid speculation, stock-price articles, ` +
            `or unrelated companies with similar names.\n\n` +
            `If the company is a subsidiary without standalone disclosure, note that and report unknown. ` +
            `If you cannot find a verifiable figure after 3-4 searches, call report_revenue with revenue_usd=null and confidence=unknown.\n\n` +
            `Always end by calling report_revenue with your findings.`,
        },
      ],
    });

    // Find the report_revenue tool_use block.
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_revenue",
    );
    if (!toolUse) {
      return { revenue_usd: null, fiscal_year: null, source_url: null, confidence: "unknown", notes: "no report_revenue call returned" };
    }
    const input = toolUse.input as Partial<ClaudeRevenueLookup>;
    return {
      revenue_usd: typeof input.revenue_usd === "number" ? input.revenue_usd : null,
      fiscal_year: typeof input.fiscal_year === "number" ? input.fiscal_year : null,
      source_url: typeof input.source_url === "string" ? input.source_url : null,
      confidence: input.confidence ?? "unknown",
      notes: input.notes ?? "",
    };
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/server/request-security";
import { getPortfolioHistory } from "@/lib/server/portfolio-history";
import { hashSeed, historicalRange } from "@/lib/price-simulation";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ ticker: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z.\-]{0,9}$/) });

// No LLM. One cached monthly-history lookup (24h cache, shared provider allowance). POST only.
export function GET() { return NextResponse.json({ error: "Use POST." }, { status: 405, headers: { ...headers, Allow: "POST" } }); }
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });
  let ticker: string;
  try { ticker = schema.parse(await request.json()).ticker; } catch { return NextResponse.json({ error: "Enter a valid ticker." }, { status: 400, headers }); }
  try {
    const history = await getPortfolioHistory(ticker);
    const range = historicalRange(history.prices, { seed: hashSeed(`${ticker}:${history.prices.at(-1)?.date ?? ""}`) });
    if ("unavailable" in range) return NextResponse.json({ error: range.unavailable }, { status: 422, headers });
    return NextResponse.json({ ticker, range, source: history.source, retrievedAt: (history as { retrievedAt?: string }).retrievedAt ?? null }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "History unavailable." }, { status: 503, headers }); }
}

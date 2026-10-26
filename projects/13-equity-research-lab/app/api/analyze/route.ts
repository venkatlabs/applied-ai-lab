import { NextRequest, NextResponse } from "next/server";
import { UsageLimitError } from '@/lib/server/usage-budget';
import { z } from "zod";
import { runResearch } from "@/lib/research-engine";
import { completionState } from "@/lib/research-completion";
import { saveSnapshot, readSnapshots } from "@/lib/server/archive";
import { sameOrigin } from "@/lib/server/request-security";
import { researchBudget, sameDayReport, claimResearchSlot, releaseResearchSlot, claimLightSlot } from "@/lib/server/research-budget";
import { guardedResearch, ResearchFailed } from "@/lib/server/guarded-research";
export const maxDuration = 300;

const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({ ticker: z.string().trim().toUpperCase().regex(/^[A-Z.\-]{1,10}$/), force: z.boolean().optional(), complete: z.boolean().optional(), reportId: z.string().uuid().optional(), tier: z.enum(["deep", "light"]).optional() });

// Paid research never runs on GET: crawlers, link unfurlers and page refreshes must not spend credits.
export function GET() {
  return NextResponse.json({ error: "Use POST to request research." }, { status: 405, headers: { ...headers, Allow: "POST" } });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Enter a valid ticker, such as NVDA or BRK-B." }, { status: 400, headers }); }

  if (input.tier === "light") {
    // Free quick screen: no AI, own provider cap, and any same-day report (deep or light) is reused.
    const today = await sameDayReport(input.ticker);
    if (today && !input.force) return NextResponse.json({ ...today, reused: true }, { headers });
    try { return NextResponse.json(await guardedResearch({ claim: claimLightSlot, run: () => runResearch(input.ticker, undefined, "light"), save: saveSnapshot, release: async () => {}, keepUnrated: false, tier: "light" }), { headers }); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "quick screen failed" }, { status: error instanceof UsageLimitError ? 429 : 400, headers }); }
  }
  const existing = await sameDayReport(input.ticker, true);
  let prior = existing;
  if (!prior && input.complete && input.reportId) {
    try { prior = (await readSnapshots(input.reportId))[0]; } catch { /* Browser-only reports can still start a fresh targeted report. */ }
    if (prior?.ticker !== input.ticker) prior = undefined;
  }
  if (existing && !input.force && (!input.complete || !completionState(existing).followUp)) {
    return NextResponse.json({ ...existing, reused: true }, { headers });
  }
  const focus = input.complete ? prior ? completionState(prior).gaps : ['A dated, source-backed valuation comparison and any missing growth, cash or funding evidence.'] : undefined;
  const budget = await researchBudget();
  if (budget.reason) return NextResponse.json({ error: budget.reason, budget }, { status: 429, headers });
  try { return NextResponse.json(await guardedResearch({ claim: claimResearchSlot, run: () => runResearch(input.ticker, focus), save: saveSnapshot, release: releaseResearchSlot, keepUnrated: true }), { headers }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "analysis failed" }, { status: error instanceof UsageLimitError ? 429 : error instanceof ResearchFailed ? 502 : 400, headers }); }
}

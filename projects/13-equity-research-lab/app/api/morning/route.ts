import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveContext } from "@/lib/server/archive";
import { sameOrigin } from "@/lib/server/request-security";
import { alertChanges, finalizeBrief, morningDepsFor, planMorning, researchItem, saveBrief } from "@/lib/server/morning-run";
import type { Brief } from "@/lib/morning";

export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("plan") }),
  z.object({ step: z.literal("research"), symbol: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z.\-]{0,9}$/) }),
]);
const maxTotal = () => { const n = Number(process.env.MORNING_RESEARCH_MAX); return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 3; };

/**
 * Prepare the morning brief on demand, one step at a time so each paid research call stays inside the function time limit and
 * errors are visible. Signed-in only (middleware); POST only; same budget and caps as the scheduled job.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  const now = new Date(), deps = morningDepsFor(ctx.owner, ctx.db, now, process.env);
  try {
    if (input.step === "plan") {
      const brief = await planMorning(ctx.owner, deps);
      await saveBrief(ctx.owner, deps, brief);
      return NextResponse.json({ brief }, { headers });
    }
    const { data } = await ctx.db.from("equity_briefs").select("payload").eq("owner_hash", ctx.owner).eq("day", now.toISOString().slice(0, 10)).maybeSingle();
    const brief = data?.payload as Brief | undefined;
    const item = brief?.items.find(i => i.symbol === input.symbol);
    if (!brief || !item) return NextResponse.json({ error: "Start the brief first." }, { status: 409, headers });
    if (item.status === "researched" || item.status === "reused") return NextResponse.json({ brief }, { headers });
    const remaining = await deps.remainingBudget();
    const updated = await researchItem(ctx.owner, deps, brief, item, { left: Math.max(0, Math.min(maxTotal() - brief.cost.reports, remaining)) });
    // Re-read so a slow step cannot overwrite a newer one.
    const { data: latest } = await ctx.db.from("equity_briefs").select("payload").eq("owner_hash", ctx.owner).eq("day", brief.day).maybeSingle();
    const base = (latest?.payload as Brief | undefined) ?? brief;
    const next = finalizeBrief({ ...base, items: base.items.map(i => i.symbol === updated.symbol ? updated : i) });
    await saveBrief(ctx.owner, deps, next);
    await alertChanges(ctx.owner, deps, [updated]);
    return NextResponse.json({ brief: next }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 200) : "The brief could not be prepared." }, { status: 500, headers }); }
}

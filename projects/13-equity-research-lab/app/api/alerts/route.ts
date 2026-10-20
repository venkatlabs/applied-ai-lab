import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveContext } from "@/lib/server/archive";
import { sameOrigin } from "@/lib/server/request-security";

const headers = { "Cache-Control": "private, no-store" };
/** Free, read-only: recent alerts, goalpost log and weekly digests for this account. */
export async function GET() {
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  const [alerts, log, digests, runs] = await Promise.all([
    ctx.db.from("equity_alerts").select("id,at,symbol,kind,direction,headline,detail,read").eq("owner_hash", ctx.owner).order("at", { ascending: false }).limit(100),
    ctx.db.from("equity_trigger_log").select("id,at,symbol,change,goalpost,reason,before,after").eq("owner_hash", ctx.owner).order("at", { ascending: false }).limit(100),
    ctx.db.from("equity_digests").select("week_ending,payload").eq("owner_hash", ctx.owner).order("week_ending", { ascending: false }).limit(8),
    ctx.db.from("equity_monitor_runs").select("kind,day,summary,ok,created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  if (alerts.error || log.error || digests.error) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  return NextResponse.json({ alerts: alerts.data, log: log.data, digests: digests.data, runs: runs.error ? [] : runs.data }, { headers });
}
const readSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  let ids: string[];
  try { ids = readSchema.parse(await request.json()).ids; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  const { error } = await ctx.db.from("equity_alerts").update({ read: true }).eq("owner_hash", ctx.owner).in("id", ids);
  if (error) return NextResponse.json({ error: "Could not update." }, { status: 503, headers });
  return NextResponse.json({ read: ids.length }, { headers });
}

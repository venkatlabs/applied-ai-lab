import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/server/cron";
import { runWeeklyDigest } from "@/lib/server/monitor-run";

export const maxDuration = 300;

// Scheduled by Vercel Cron with CRON_SECRET. Uses no LLM; provider calls are metered. Fails closed without the secret.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try { return NextResponse.json(await runWeeklyDigest(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false, summary: "The job failed." }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/server/cron";
import { runMorningJob } from "@/lib/server/morning-run";

export const maxDuration = 300;

// 7 a.m. preparation: fresh reports on the most concentrated holdings plus new names from other industries.
// Paid research is opt-in (MORNING_RESEARCH_ENABLED), capped (MORNING_RESEARCH_MAX and the shared daily cap) and needs CRON_SECRET.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try { return NextResponse.json(await runMorningJob(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false, summary: "The job failed." }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}

import { NextResponse } from "next/server";
import { archiveContext } from "@/lib/server/archive";

const headers = { "Cache-Control": "private, no-store" };
/** Free, read-only: the latest morning brief for this account. */
export async function GET() {
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  const { data, error } = await ctx.db.from("equity_briefs").select("day,payload").eq("owner_hash", ctx.owner).order("day", { ascending: false }).limit(2);
  if (error) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  return NextResponse.json({ brief: data?.[0]?.payload ?? null, previousDay: data?.[1]?.day ?? null }, { headers });
}

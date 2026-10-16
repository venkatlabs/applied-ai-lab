import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveContext } from "@/lib/server/archive";
import { sameOrigin } from "@/lib/server/request-security";

const headers = { "Cache-Control": "private, no-store" };
const symbol = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z.\-]{0,9}$/);
const addSchema = z.object({ symbols: z.array(symbol).min(1).max(100), source: z.enum(["follow", "holding"]).default("follow") });
const removeSchema = z.object({ symbol });

/** Free, read-only: the symbols this account follows. */
export async function GET() {
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  const { data, error } = await ctx.db.from("equity_followed").select("symbol,source").eq("owner_hash", ctx.owner).limit(500);
  if (error) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  return NextResponse.json({ stocks: data ?? [] }, { headers });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  let input: z.infer<typeof addSchema>;
  try { input = addSchema.parse(await request.json()); } catch { return NextResponse.json({ error: "Enter valid ticker symbols." }, { status: 400, headers }); }
  const rows = [...new Set(input.symbols)].map(s => ({ owner_hash: ctx.owner, symbol: s, source: input.source }));
  // Never downgrade a followed stock to 'holding' or vice versa; just ensure presence.
  const { error } = await ctx.db.from("equity_followed").upsert(rows, { onConflict: "owner_hash,symbol", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 503, headers });
  return NextResponse.json({ saved: rows.length }, { headers });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed" }, { status: 403, headers });
  const ctx = await archiveContext();
  if (!ctx) return NextResponse.json({ error: "Account storage unavailable." }, { status: 503, headers });
  let input: z.infer<typeof removeSchema>;
  try { input = removeSchema.parse(await request.json()); } catch { return NextResponse.json({ error: "Enter a valid ticker symbol." }, { status: 400, headers }); }
  const { error } = await ctx.db.from("equity_followed").delete().eq("owner_hash", ctx.owner).eq("symbol", input.symbol);
  if (error) return NextResponse.json({ error: "Could not remove." }, { status: 503, headers });
  return NextResponse.json({ removed: input.symbol }, { headers });
}

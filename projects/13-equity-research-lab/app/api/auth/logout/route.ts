import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(request.nextUrl.protocol === "https:", 0));
  return response;
}

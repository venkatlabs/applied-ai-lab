import { NextRequest, NextResponse } from "next/server";
import { FLOW_COOKIE, FLOW_SECONDS, authConfig, cookieOptions, startLogin } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.redirect(new URL("/signin?error=not-configured", request.url));
  const { url, flow } = await startLogin(cfg, new URL("/api/auth/callback", request.url).toString(), request.nextUrl.searchParams.get("next") ?? "/");
  const response = NextResponse.redirect(url);
  response.cookies.set(FLOW_COOKIE, flow, cookieOptions(request.nextUrl.protocol === "https:", FLOW_SECONDS));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

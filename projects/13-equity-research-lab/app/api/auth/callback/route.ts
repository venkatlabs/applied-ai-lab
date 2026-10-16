import { NextRequest, NextResponse } from "next/server";
import { FLOW_COOKIE, SESSION_COOKIE, SESSION_SECONDS, accountOwnerHash, authConfig, cookieOptions, cookieValue, finishLogin } from "@/lib/server/auth";
import { claimWorkspace } from "@/lib/server/archive";

export async function GET(request: NextRequest) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.redirect(new URL("/signin?error=not-configured", request.url));
  const params = request.nextUrl.searchParams;
  const secure = request.nextUrl.protocol === "https:";
  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(reason)}`, request.url));
    response.cookies.set(FLOW_COOKIE, "", cookieOptions(secure, 0));
    return response;
  };
  if (params.get("error")) return fail("Google sign-in was cancelled.");
  const result = await finishLogin(cfg, { code: params.get("code"), state: params.get("state"), flow: cookieValue(request.headers.get("cookie"), FLOW_COOKIE) },
    new URL("/api/auth/callback", request.url).toString());
  if (!result.ok) return fail(result.reason);
  // Best effort: attach reports from this browser's anonymous workspace to the account.
  await claimWorkspace(cookieValue(request.headers.get("cookie"), "research_workspace"), await accountOwnerHash(result.user.sub)).catch(() => undefined);
  const response = NextResponse.redirect(new URL(result.next, request.url));
  response.cookies.set(SESSION_COOKIE, result.session, cookieOptions(secure, SESSION_SECONDS));
  response.cookies.set(FLOW_COOKIE, "", cookieOptions(secure, 0));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

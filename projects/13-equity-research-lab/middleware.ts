import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, accessDecision, authConfig, readSession } from "./lib/server/auth";

export async function middleware(request: NextRequest) {
  const cfg = authConfig();
  const { pathname, search } = request.nextUrl;
  const signedIn = cfg ? !!(await readSession(cfg, request.cookies.get(SESSION_COOKIE)?.value)) : false;
  const decision = accessDecision(pathname, !!cfg, signedIn);
  if (decision === "deny") return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (decision === "redirect") {
    const url = new URL("/signin", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // Legacy anonymous workspace cookie: still issued so earlier history can be claimed on first sign-in.
  const existing = request.cookies.get("research_workspace")?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return NextResponse.next();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  request.cookies.set("research_workspace", token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set("research_workspace", token, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"] };

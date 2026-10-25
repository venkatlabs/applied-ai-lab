import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/server/request-security";
import { OWNER_COOKIE, accessKeyMatches, createOwnerSession, ownerCookieOptions, ownerKey } from "@/lib/server/owner-auth";

const noStore = { "Cache-Control": "private, no-store" };

/** Owner sign-in: exchanges OWNER_ACCESS_KEY for a short-lived signed session cookie. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403, headers: noStore });
  if (!ownerKey()) return NextResponse.json({ error: "Owner sign-in is not configured on this deployment." }, { status: 503, headers: noStore });
  let key: unknown;
  try { key = (await request.json())?.key; } catch { key = undefined; }
  if (!accessKeyMatches(key)) return NextResponse.json({ error: "That access key is not valid." }, { status: 401, headers: noStore });
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(OWNER_COOKIE, createOwnerSession(), ownerCookieOptions(request.nextUrl.protocol === "https:"));
  return response;
}

/** Sign out. */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403, headers: noStore });
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  response.cookies.set(OWNER_COOKIE, "", { ...ownerCookieOptions(request.nextUrl.protocol === "https:"), maxAge: 0 });
  return response;
}

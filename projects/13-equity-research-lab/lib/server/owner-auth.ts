import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-owner sign-in for routes that expose private financial data.
 * The owner proves possession of OWNER_ACCESS_KEY once; the server then issues a
 * short-lived HMAC-signed httpOnly cookie. Unset or weak keys fail closed.
 */
export const OWNER_COOKIE = "owner_session";
export const OWNER_SESSION_SECONDS = 12 * 60 * 60;
const MIN_KEY_LENGTH = 32;
const CONTEXT = "equity-research-lab:owner-session:v1";

type Env = Record<string, string | undefined>;

export function ownerKey(env: Env = process.env): string | null {
  const key = env.OWNER_ACCESS_KEY?.trim();
  return key && key.length >= MIN_KEY_LENGTH ? key : null;
}

function digest(value: string) { return createHash("sha256").update(value).digest(); }
function sign(key: string, expiresAt: number) {
  return createHmac("sha256", key).update(`${CONTEXT}:${expiresAt}`).digest("base64url");
}
function sameSecret(a: string, b: string) { return timingSafeEqual(digest(a), digest(b)); }

/** Constant-time check of a submitted access key. */
export function accessKeyMatches(candidate: unknown, env: Env = process.env): boolean {
  const key = ownerKey(env);
  return Boolean(key && typeof candidate === "string" && candidate.length <= 512 && sameSecret(candidate.trim(), key));
}

export function createOwnerSession(env: Env = process.env, now = Date.now()): string {
  const key = ownerKey(env);
  if (!key) throw new Error("Owner sign-in is not configured.");
  const expiresAt = now + OWNER_SESSION_SECONDS * 1000;
  return `${expiresAt}.${sign(key, expiresAt)}`;
}

export function verifyOwnerSession(value: string | undefined, env: Env = process.env, now = Date.now()): boolean {
  const key = ownerKey(env);
  if (!key || !value) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!(expiresAt > now) || expiresAt - now > OWNER_SESSION_SECONDS * 1000) return false;
  return sameSecret(match[2], sign(key, expiresAt));
}

export function ownerCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "strict" as const, path: "/", maxAge: OWNER_SESSION_SECONDS };
}

/** Reads the owner cookie from a raw request (route handlers). */
export function isOwnerRequest(request: Request, env: Env = process.env, now = Date.now()): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(/;\s*/).find(part => part.startsWith(`${OWNER_COOKIE}=`))?.slice(OWNER_COOKIE.length + 1);
  return verifyOwnerSession(value, env, now);
}

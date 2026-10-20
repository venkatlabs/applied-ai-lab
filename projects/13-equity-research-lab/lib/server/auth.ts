/**
 * Google account sign-in (OpenID Connect authorization-code flow) with a single-owner email allowlist.
 * Uses Web Crypto only so the same code runs in middleware (edge) and route handlers (node).
 * The id_token is accepted only from the server-to-server token response over TLS, and its audience,
 * issuer, expiry, nonce and verified email are all checked before a signed session cookie is issued.
 */
export const SESSION_COOKIE = "lab_session";
export const FLOW_COOKIE = "lab_oauth";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const FLOW_SECONDS = 10 * 60;
const CONTEXT = "equity-research-lab:session:v2";
const FLOW_CONTEXT = "equity-research-lab:oauth-flow:v1";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

type Env = Record<string, string | undefined>;
export type AuthConfig = { clientId: string; clientSecret: string; secret: string; emails: string[] };
export type Session = { sub: string; email: string; name?: string; exp: number };

export function authConfig(env: Env = process.env): AuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_CLIENT_SECRET?.trim(), secret = env.AUTH_SECRET?.trim();
  const emails = (env.OWNER_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!clientId || !clientSecret || !secret || secret.length < 32 || !emails.length) return null;
  return { clientId, clientSecret, secret, emails };
}

const enc = new TextEncoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  let s = ""; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
async function mac(secret: string, context: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(`${context}:${payload}`)));
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function seal(secret: string, context: string, value: object) {
  const payload = b64(enc.encode(JSON.stringify(value)));
  return `${payload}.${await mac(secret, context, payload)}`;
}
async function open<T>(secret: string, context: string, token: string | undefined): Promise<T | null> {
  const parts = token?.split(".");
  if (!parts || parts.length !== 2 || token!.length > 4096) return null;
  try {
    if (!same(parts[1], await mac(secret, context, parts[0]))) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(unb64(parts[0]), c => c.charCodeAt(0)))) as T;
  } catch { return null; }
}

export async function createSession(cfg: AuthConfig, user: { sub: string; email: string; name?: string }, now = Date.now()) {
  return seal(cfg.secret, CONTEXT, { ...user, exp: now + SESSION_SECONDS * 1000 } satisfies Session);
}
export async function readSession(cfg: AuthConfig | null, token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!cfg) return null;
  const s = await open<Session>(cfg.secret, CONTEXT, token);
  if (!s || typeof s.sub !== "string" || typeof s.email !== "string" || typeof s.exp !== "number") return null;
  if (!(s.exp > now) || s.exp - now > SESSION_SECONDS * 1000) return null;
  return cfg.emails.includes(s.email.toLowerCase()) ? s : null;
}
export function cookieValue(header: string | null | undefined, name: string) {
  return (header ?? "").split(/;\s*/).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1);
}
export const sessionFromRequest = (cfg: AuthConfig | null, request: Request) => readSession(cfg, cookieValue(request.headers.get("cookie"), SESSION_COOKIE));
export function cookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge };
}

const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(24)));
export async function startLogin(cfg: AuthConfig, redirectUri: string, next: string, now = Date.now()) {
  const state = randomToken(), nonce = randomToken();
  const flow = await seal(cfg.secret, FLOW_CONTEXT, { state, nonce, next: safeNext(next), exp: now + FLOW_SECONDS * 1000 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account" }).toString();
  return { url: url.toString(), flow };
}
export function safeNext(next: string | null | undefined) {
  return next && /^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/.test(next) && !next.startsWith("/api/") ? next : "/";
}

export type LoginResult = { ok: true; session: string; user: { sub: string; email: string; name?: string }; next: string } | { ok: false; reason: string };
export async function finishLogin(
  cfg: AuthConfig, input: { code: string | null; state: string | null; flow: string | undefined }, redirectUri: string,
  fetchImpl: typeof fetch = fetch, now = Date.now(),
): Promise<LoginResult> {
  const flow = await open<{ state: string; nonce: string; next: string; exp: number }>(cfg.secret, FLOW_CONTEXT, input.flow);
  if (!flow || !(flow.exp > now)) return { ok: false, reason: "Sign-in expired. Start again." };
  if (!input.state || !same(input.state, flow.state) || !input.code) return { ok: false, reason: "Sign-in could not be verified. Start again." };
  let claims: Record<string, unknown>;
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store",
      body: new URLSearchParams({ code: input.code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, reason: "Google rejected the sign-in. Start again." };
    const body = await response.json() as { id_token?: string };
    const payload = body.id_token?.split(".")[1];
    if (!payload) return { ok: false, reason: "Google did not return an identity." };
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(unb64(payload), c => c.charCodeAt(0))));
  } catch { return { ok: false, reason: "Could not reach Google. Try again." }; }
  const exp = Number(claims.exp) * 1000, aud = claims.aud, email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  if (!ISSUERS.includes(String(claims.iss)) || (Array.isArray(aud) ? !aud.includes(cfg.clientId) : aud !== cfg.clientId) || !(exp > now) || claims.nonce !== flow.nonce)
    return { ok: false, reason: "Sign-in could not be verified. Start again." };
  if (claims.email_verified !== true || typeof claims.sub !== "string" || !claims.sub) return { ok: false, reason: "That Google account has no verified email." };
  if (!cfg.emails.includes(email)) return { ok: false, reason: "This Google account is not allowed to use this app." };
  const user = { sub: claims.sub, email, name: typeof claims.name === "string" ? claims.name.slice(0, 100) : undefined };
  return { ok: true, session: await createSession(cfg, user, now), user, next: flow.next };
}

/** Stable, non-reversible owner key for archive rows. */
export async function accountOwnerHash(sub: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`google:${sub}`));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

// /api/cron/* authenticates with CRON_SECRET inside the route; browsers never reach it with a session.
const PUBLIC = [/^\/signin$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/robots\.txt$/];
/** Pure access decision used by middleware. */
export function accessDecision(pathname: string, configured: boolean, signedIn: boolean): "allow" | "redirect" | "deny" {
  if (!configured || signedIn || PUBLIC.some(p => p.test(pathname))) return "allow";
  return pathname.startsWith("/api/") ? "deny" : "redirect";
}

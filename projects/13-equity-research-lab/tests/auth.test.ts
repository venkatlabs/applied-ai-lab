import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_SECONDS, accessDecision, accountOwnerHash, authConfig, createSession, finishLogin, readSession, safeNext, sessionFromRequest, startLogin } from "../lib/server/auth";

const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", AUTH_SECRET: "s".repeat(40), OWNER_EMAILS: "Me@Example.com, other@example.com" };
const cfg = authConfig(env)!;
const now = Date.parse("2026-10-16T12:00:00Z");
const redirect = "https://lab.test/api/auth/callback";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (over: Record<string, unknown> = {}, nonce = "") => `h.${b64({ iss: "https://accounts.google.com", aud: "cid", exp: now / 1000 + 600, sub: "123", email: "me@example.com", email_verified: true, name: "Me", nonce, ...over })}.s`;
const google = (over: Record<string, unknown> = {}) => vi.fn(async (_u: unknown, init: RequestInit) => {
  expect(String((init.body as URLSearchParams).get("code"))).toBe("abc");
  return new Response(JSON.stringify({ id_token: idToken(over, (globalThis as any).__nonce) }), { status: 200 });
}) as unknown as typeof fetch;

async function begin() {
  const { url, flow } = await startLogin(cfg, redirect, "/company/NVDA", now);
  const u = new URL(url);
  (globalThis as any).__nonce = u.searchParams.get("nonce");
  return { state: u.searchParams.get("state"), flow, url: u };
}

describe("config", () => {
  it("fails closed unless every setting is present and the secret is long", () => {
    expect(authConfig({})).toBeNull();
    expect(authConfig({ ...env, AUTH_SECRET: "short" })).toBeNull();
    expect(authConfig({ ...env, OWNER_EMAILS: " , " })).toBeNull();
    expect(cfg.emails).toEqual(["me@example.com", "other@example.com"]);
  });
});

describe("session cookie", () => {
  it("round-trips and rejects tampering, expiry, other secrets and removed emails", async () => {
    const token = await createSession(cfg, { sub: "1", email: "me@example.com" }, now);
    expect((await readSession(cfg, token, now + 1000))?.email).toBe("me@example.com");
    expect(await readSession(cfg, token, now + SESSION_SECONDS * 1000 + 1)).toBeNull();
    const [p, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "1", email: "evil@example.com", exp: now + 1e6 })).toString("base64url");
    expect(await readSession(cfg, `${forged}.${sig}`, now)).toBeNull();
    expect(await readSession(cfg, `${p}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, now)).toBeNull();
    expect(await readSession(authConfig({ ...env, AUTH_SECRET: "z".repeat(40) }), token, now)).toBeNull();
    expect(await readSession(authConfig({ ...env, OWNER_EMAILS: "x@example.com" }), token, now)).toBeNull();
    expect(await readSession(null, token, now)).toBeNull();
    expect(await readSession(cfg, "garbage", now)).toBeNull();
    expect(await readSession(cfg, undefined, now)).toBeNull();
  });
  it("reads the session from a request cookie header", async () => {
    const token = await createSession(cfg, { sub: "1", email: "me@example.com" }, Date.now());
    const req = (cookie: string) => new Request("https://lab.test/", { headers: { cookie } });
    expect(await sessionFromRequest(cfg, req(`a=b; ${SESSION_COOKIE}=${token}`))).not.toBeNull();
    expect(await sessionFromRequest(cfg, req("a=b"))).toBeNull();
  });
});

describe("login flow", () => {
  it("sends the right parameters to Google", async () => {
    const { url } = await begin();
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
    expect(url.searchParams.get("scope")).toContain("email");
  });
  it("completes for an allowed, verified account and returns to the requested page", async () => {
    const { state, flow } = await begin();
    const r = await finishLogin(cfg, { code: "abc", state, flow }, redirect, google(), now);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.next).toBe("/company/NVDA"); expect((await readSession(cfg, r.session, now))?.sub).toBe("123"); }
  });
  it.each([
    ["wrong audience", { aud: "other" }],
    ["wrong issuer", { iss: "https://evil.example" }],
    ["expired token", { exp: now / 1000 - 5 }],
    ["wrong nonce", { nonce: "different" }],
    ["unverified email", { email_verified: false }],
    ["email not on the allowlist", { email: "stranger@gmail.com" }],
  ])("rejects %s", async (_n, over) => {
    const { state, flow } = await begin();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id_token: idToken({ nonce: (globalThis as any).__nonce, ...over }) }), { status: 200 })) as unknown as typeof fetch;
    expect((await finishLogin(cfg, { code: "abc", state, flow }, redirect, fetchImpl, now)).ok).toBe(false);
  });
  it("rejects a mismatched state, missing code, expired flow and Google errors", async () => {
    const { state, flow } = await begin();
    expect((await finishLogin(cfg, { code: "abc", state: "x", flow }, redirect, google(), now)).ok).toBe(false);
    expect((await finishLogin(cfg, { code: null, state, flow }, redirect, google(), now)).ok).toBe(false);
    expect((await finishLogin(cfg, { code: "abc", state, flow }, redirect, google(), now + 11 * 60 * 1000)).ok).toBe(false);
    expect((await finishLogin(cfg, { code: "abc", state, flow: undefined }, redirect, google(), now)).ok).toBe(false);
    const bad = vi.fn(async () => new Response("no", { status: 400 })) as unknown as typeof fetch;
    expect((await finishLogin(cfg, { code: "abc", state, flow }, redirect, bad, now)).ok).toBe(false);
    const down = vi.fn(async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect((await finishLogin(cfg, { code: "abc", state, flow }, redirect, down, now)).ok).toBe(false);
  });
  it("only allows same-site relative return paths", () => {
    expect(safeNext("/company/NVDA?x=1")).toBe("/company/NVDA?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/api/snaptrade", "javascript:alert(1)", null, undefined]) expect(safeNext(bad as string)).toBe("/");
  });
});

describe("access decision and ownership", () => {
  it("allows everything when not configured, gates when configured", () => {
    expect(accessDecision("/", false, false)).toBe("allow");
    expect(accessDecision("/", true, false)).toBe("redirect");
    expect(accessDecision("/api/analyze", true, false)).toBe("deny");
    expect(accessDecision("/api/snaptrade", true, true)).toBe("allow");
    for (const open of ["/signin", "/api/auth/login", "/api/auth/callback", "/api/cron/monitor", "/api/cron/digest", "/robots.txt"]) expect(accessDecision(open, true, false)).toBe("allow");
  });
  it("derives a stable 64-hex account hash", async () => {
    const h = await accountOwnerHash("123");
    expect(h).toMatch(/^[a-f0-9]{64}$/); expect(await accountOwnerHash("123")).toBe(h); expect(await accountOwnerHash("124")).not.toBe(h);
  });
});

describe("/api/snaptrade with Google sign-in", () => {
  afterEach(() => vi.unstubAllEnvs());
  const post = (cookie?: string) => new NextRequest("https://lab.test/api/snaptrade", { method: "POST", headers: { origin: "https://lab.test", ...(cookie ? { cookie } : {}) } });
  it("requires a valid Google session when configured", async () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.stubEnv("SNAPTRADE_PORTAL_ENABLED", "false");
    const { POST } = await import("../app/api/snaptrade/route");
    expect((await POST(post())).status).toBe(401);
    const token = await createSession(cfg, { sub: "1", email: "me@example.com" }, Date.now());
    expect((await POST(post(`${SESSION_COOKIE}=${token}`))).status).toBe(503);
  });
});

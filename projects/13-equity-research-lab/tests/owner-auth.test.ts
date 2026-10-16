import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  OWNER_COOKIE, OWNER_SESSION_SECONDS, accessKeyMatches, createOwnerSession, isOwnerRequest, ownerKey, verifyOwnerSession,
} from "../lib/server/owner-auth";

const KEY = "k".repeat(40);
const env = { OWNER_ACCESS_KEY: KEY };
const now = Date.parse("2026-10-04T12:00:00Z");

describe("owner session signing", () => {
  it("fails closed when the key is missing or too short", () => {
    expect(ownerKey({})).toBeNull();
    expect(ownerKey({ OWNER_ACCESS_KEY: "short" })).toBeNull();
    expect(accessKeyMatches("short", { OWNER_ACCESS_KEY: "short" })).toBe(false);
    expect(() => createOwnerSession({})).toThrow("not configured");
    expect(verifyOwnerSession(createOwnerSession(env, now), {}, now)).toBe(false);
  });
  it("accepts only the exact access key", () => {
    expect(accessKeyMatches(KEY, env)).toBe(true);
    expect(accessKeyMatches(`${KEY}x`, env)).toBe(false);
    expect(accessKeyMatches(undefined, env)).toBe(false);
    expect(accessKeyMatches({ key: KEY }, env)).toBe(false);
  });
  it("verifies a fresh session and rejects expired, tampered or foreign-key sessions", () => {
    const session = createOwnerSession(env, now);
    expect(verifyOwnerSession(session, env, now + 1000)).toBe(true);
    expect(verifyOwnerSession(session, env, now + OWNER_SESSION_SECONDS * 1000 + 1)).toBe(false);
    const [expires, sig] = session.split(".");
    expect(verifyOwnerSession(`${Number(expires) + 1000}.${sig}`, env, now)).toBe(false);
    const flipped = `${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    expect(verifyOwnerSession(`${expires}.${flipped}`, env, now)).toBe(false);
    expect(verifyOwnerSession(session, { OWNER_ACCESS_KEY: "z".repeat(40) }, now)).toBe(false);
    expect(verifyOwnerSession("garbage", env, now)).toBe(false);
  });
  it("rejects sessions claiming a lifetime longer than allowed", () => {
    const far = createOwnerSession(env, now + 10 * OWNER_SESSION_SECONDS * 1000);
    expect(verifyOwnerSession(far, env, now)).toBe(false);
  });
  it("reads the session from the raw cookie header", () => {
    const session = createOwnerSession(env, now);
    const req = (cookie: string) => new Request("https://lab.test/api", { headers: { cookie } });
    expect(isOwnerRequest(req(`research_workspace=abc; ${OWNER_COOKIE}=${session}`), env, now)).toBe(true);
    expect(isOwnerRequest(req("research_workspace=abc"), env, now)).toBe(false);
  });
});

describe("/api/snaptrade requires an owner session", () => {
  afterEach(() => vi.unstubAllEnvs());
  const post = (headers: Record<string, string>) =>
    new NextRequest("https://lab.test/api/snaptrade", { method: "POST", headers });

  it("rejects a forged same-origin request with no session (401) before touching SnapTrade", async () => {
    vi.stubEnv("OWNER_ACCESS_KEY", KEY);
    vi.stubEnv("SNAPTRADE_PORTAL_ENABLED", "true");
    const { POST } = await import("../app/api/snaptrade/route");
    const res = await POST(post({ origin: "https://lab.test" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects every request when the owner key is not configured", async () => {
    vi.stubEnv("OWNER_ACCESS_KEY", "");
    vi.stubEnv("SNAPTRADE_PORTAL_ENABLED", "true");
    const { POST } = await import("../app/api/snaptrade/route");
    const session = createOwnerSession(env);
    expect((await POST(post({ origin: "https://lab.test", cookie: `${OWNER_COOKIE}=${session}` }))).status).toBe(401);
  });
  it("lets a valid owner session through to the existing enablement check", async () => {
    vi.stubEnv("OWNER_ACCESS_KEY", KEY);
    vi.stubEnv("SNAPTRADE_PORTAL_ENABLED", "false");
    const { POST } = await import("../app/api/snaptrade/route");
    const res = await POST(post({ origin: "https://lab.test", cookie: `${OWNER_COOKIE}=${createOwnerSession(env)}` }));
    expect(res.status).toBe(503);
  });
});

describe("/api/owner-session sign-in", () => {
  afterEach(() => vi.unstubAllEnvs());
  const signIn = (body: unknown, origin = "https://lab.test") =>
    new NextRequest("https://lab.test/api/owner-session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

  it("issues a strict httpOnly cookie only for the right key and origin", async () => {
    vi.stubEnv("OWNER_ACCESS_KEY", KEY);
    const { POST } = await import("../app/api/owner-session/route");
    expect((await POST(signIn({ key: "wrong" }))).status).toBe(401);
    expect((await POST(signIn({ key: KEY }, "https://attacker.test"))).status).toBe(403);
    const ok = await POST(signIn({ key: KEY }));
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${OWNER_COOKIE}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).not.toContain(KEY);
  });
  it("reports sign-in as unavailable when no key is configured", async () => {
    vi.stubEnv("OWNER_ACCESS_KEY", "");
    const { POST } = await import("../app/api/owner-session/route");
    expect((await POST(signIn({ key: "" }))).status).toBe(503);
  });
});

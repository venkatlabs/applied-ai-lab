import { describe, expect, it, vi } from "vitest";
import { providerFailure } from "../lib/provider-failure";
import { guardedResearch, ResearchFailed } from "../lib/server/guarded-research";
import { releaseUsage, type UsageStore } from "../lib/server/usage-budget";
import type { ResearchRun } from "../lib/types";

const expired = 'OpenAI research failed: HTTP 401 { "error": { "message": "Your API key has expired. Create a new API key to continue.", "type": "invalid_request_error", "code": "expired_secret_key", "param": null }, "status": 401 }';
const failedRun = (notes: string[], over: Record<string, unknown> = {}) => ({ id: "r", ticker: "AMZN", score: 0, dataMode: "live", notes, ...over }) as unknown as ResearchRun;
const realNotes = ["Live evidence loaded, but the AI synthesis failed. No demo score or verdict was substituted.", "Provider note: Individual analyst identities and track records require the optional TipRanks data add-on.", "Provider note: Automatic web research did not complete. Unsupported investment factors remain unknown.", `Provider note: ${expired}`];

describe("providerFailure", () => {
  it("recognises the expired key from the real report notes and names the fix", () => {
    const f = providerFailure(failedRun(realNotes))!;
    expect(f.kind).toBe("auth"); expect(f.message).toContain("Your API key has expired"); expect(f.message).toContain("OPENAI_API_KEY");
    expect(f.message).not.toContain("TipRanks");
  });
  it("tells quota, rate-limit and generic failures apart, and ignores healthy runs", () => {
    expect(providerFailure(failedRun(["Provider note: OpenAI research failed: HTTP 429 rate limit"]))!.kind).toBe("rate");
    expect(providerFailure(failedRun(['Provider note: OpenAI research failed: HTTP 429 { "error": { "message": "You exceeded your current quota", "code": "insufficient_quota" } }']))!.kind).toBe("quota");
    expect(providerFailure(failedRun(["Live evidence loaded, but the AI synthesis failed."]))!.kind).toBe("other");
    expect(providerFailure(failedRun(["Data coverage note: something minor"], { investmentCase: {} }))).toBeNull();
  });
});

describe("guardedResearch", () => {
  const deps = (run: ResearchRun, keepUnrated = false) => ({ claim: vi.fn(async () => {}), run: vi.fn(async () => run), save: vi.fn(async (r: ResearchRun) => ({ ...r, storage: "cloud" as const })), release: vi.fn(async () => {}), keepUnrated });
  it("saves a rated run and keeps its budget slot", async () => {
    const d = deps(failedRun([], { investmentCase: {} }));
    expect((await guardedResearch(d)).storage).toBe("cloud"); expect(d.release).not.toHaveBeenCalled();
  });
  it("returns the slot and saves nothing when the key is expired, whoever asked", async () => {
    for (const keep of [false, true]) {
      const d = deps(failedRun(realNotes), keep);
      await expect(guardedResearch(d)).rejects.toMatchObject({ kind: "auth", message: expect.stringContaining("expired") });
      expect(d.release).toHaveBeenCalledTimes(1); expect(d.save).not.toHaveBeenCalled();
    }
  });
  it("keeps other unrated runs only when the caller can finish them later, and never refunds those", async () => {
    const d1 = deps(failedRun(["Live evidence loaded, but the AI synthesis failed."]), true);
    expect((await guardedResearch(d1)).storage).toBe("cloud"); expect(d1.release).not.toHaveBeenCalled();
    const d2 = deps(failedRun(["Live evidence loaded, but the AI synthesis failed."]), false);
    await expect(guardedResearch(d2)).rejects.toBeInstanceOf(ResearchFailed); expect(d2.save).not.toHaveBeenCalled(); expect(d2.release).not.toHaveBeenCalled();
  });
});

describe("releaseUsage", () => {
  const store = (start: number | null): UsageStore & { value: number | null } => {
    const s = { value: start, read: async () => s.value, insert: async () => false, compareAndSet: async (_p: string, _d: string, prev: number, next: number) => { if (s.value !== prev) return false; s.value = next; return true; } };
    return s;
  };
  it("gives back one reservation and never goes below zero", async () => {
    const s = store(3); await releaseUsage(s, "research", "2026-10-24"); expect(s.value).toBe(2);
    const z = store(0); await releaseUsage(z, "research", "2026-10-24"); expect(z.value).toBe(0);
    const n = store(null); await releaseUsage(n, "research", "2026-10-24"); expect(n.value).toBeNull();
  });
});

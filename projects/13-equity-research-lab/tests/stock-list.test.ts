import { describe, expect, it, vi } from "vitest";
import { buildStockRows, researchQueue, sinceCall, summarize } from "../lib/stock-list";
import { researchOutcome } from "../lib/outcome";
import { factorKeys } from "../lib/investment";
import type { ResearchRun } from "../lib/types";

const now = new Date("2026-10-16T12:00:00Z");
const run = (ticker: string, rating: string, over: Record<string, unknown> = {}) => ({
  id: `${ticker}-${over.analyzedAt ?? "1"}`, ticker, companyName: `${ticker} Co`, analyzedAt: "2026-10-10T00:00:00Z", marketAsOf: "2026-10-09", asOfPrice: 100, dataMode: "live", score: 0,
  highlights: [], risks: [], thesisKillers: [],
  investmentCase: { factors: Object.fromEntries(factorKeys.map(k => [k, { rating, reason: "r", evidenceDate: "2026-10-01", sources: ["https://x.example/a"] }])), valuationBasis: "Peer comparison", valuationBenchmark: "", growthOutlook: "", strongestCounterargument: "", timing: "", changeMind: "" },
  ...over }) as unknown as ResearchRun;

describe("buildStockRows", () => {
  it("lists owned, followed and researched stocks once each and puts what needs attention first", () => {
    const rows = buildStockRows({
      owned: ["AAA", "BBB", "CCC"], following: ["DDD", "AAA"], now,
      runs: [run("BBB", "Very weak"), run("CCC", "Strong"), run("EEE", "Very strong"), run("CCC", "Mixed", { analyzedAt: "2026-09-01T00:00:00Z", id: "old" })],
    });
    expect(rows.map(r => r.symbol)).toEqual(["AAA", "BBB", "CCC", "EEE", "DDD"]);
    expect(rows[0]).toMatchObject({ owned: true, following: true, action: "Research" });
    expect(rows[0].outcome.verdict).toBe("Not researched");
    expect(rows[1].outcome.verdict).toBe("Sell / Avoid");
    expect(rows.find(r => r.symbol === "CCC")).toMatchObject({ reportCount: 2, action: "Open" });
  });
  it("flags owned stocks with an old report for refresh", () => {
    const rows = buildStockRows({ owned: ["OLD"], following: [], runs: [run("OLD", "Strong", { analyzedAt: "2026-08-01T00:00:00Z", marketAsOf: "2026-07-31" })], now });
    expect(rows[0]).toMatchObject({ action: "Refresh", priority: 2 });
  });
  it("ignores invalid symbols and demo reports", () => {
    const rows = buildStockRows({ owned: ["bad symbol", "ok"], following: ["<script>"], runs: [run("DEMO", "Strong", { dataMode: "demo" })], now });
    expect(rows.map(r => r.symbol)).toEqual(["OK"]);
  });
});

describe("sinceCall", () => {
  const r = run("AAA", "Strong"), o = researchOutcome(r, now);
  it("measures the move since the call and whether it went the verdict's way", () => {
    const buy = researchOutcome(run("B", "Very strong"), now);
    expect(sinceCall(run("B", "Very strong"), buy, { price: 110, date: "2026-10-16" })).toEqual({ movePct: 10, days: 7, right: true });
    expect(sinceCall(run("B", "Very strong"), buy, { price: 90, date: "2026-10-16" })?.right).toBe(false);
    const sell = researchOutcome(run("S", "Very weak"), now);
    expect(sinceCall(run("S", "Very weak"), sell, { price: 90, date: "2026-10-16" })?.right).toBe(true);
  });
  it("needs a real later price at least a week on and a researched stock", () => {
    expect(sinceCall(r, o, undefined)).toBeNull();
    expect(sinceCall(r, o, { price: 0, date: "2026-10-15" })).toBeNull();
    expect(sinceCall(r, o, { price: 105, date: "2026-10-12" })).toBeNull();
    expect(sinceCall(undefined, researchOutcome(undefined), { price: 105, date: "2026-10-15" })).toBeNull();
  });
  it("treats a hold as right while the price stays within 10%", () => {
    const hold = run("H", "Mixed"), ho = researchOutcome(hold, now);
    expect(ho.verdict).toBe("Hold");
    expect(sinceCall(hold, ho, { price: 105, date: "2026-10-16" })?.right).toBe(true);
    expect(sinceCall(hold, ho, { price: 130, date: "2026-10-16" })?.right).toBe(false);
  });
});

describe("summary and research queue", () => {
  const rows = buildStockRows({ owned: ["A", "B", "C", "D"], following: ["F"], runs: [run("B", "Very weak")], now });
  it("counts what needs doing", () => {
    expect(summarize(rows)).toMatchObject({ total: 5, researched: 1, needResearch: 3, reduce: 1 });
  });
  it("queues only owned unresearched stocks within the remaining budget and the cap", () => {
    expect(researchQueue(rows, 10)).toEqual(["A", "C", "D"]);
    expect(researchQueue(rows, 2)).toEqual(["A", "C"]);
    expect(researchQueue(rows, 0)).toEqual([]);
    expect(researchQueue(rows, 10, 1)).toEqual(["A"]);
  });
});

describe("/api/stocks", () => {
  const post = (body: unknown, origin = "https://lab.test") => new Request("https://lab.test/api/stocks", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  it("rejects foreign origins, bad symbols, and stores symbols for the signed-in owner", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    vi.doMock("@/lib/server/archive", () => ({ archiveContext: async () => ({ owner: "o".repeat(64), db: { from: () => ({ upsert }) } }) }));
    const { POST } = await import("../app/api/stocks/route");
    expect((await POST(post({ symbols: ["NVDA"] }, "https://evil.test"))).status).toBe(403);
    expect((await POST(post({ symbols: ["<x>"] }))).status).toBe(400);
    expect((await POST(post({ symbols: ["nvda", "NVDA", "brk-b"] }))).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith([{ owner_hash: "o".repeat(64), symbol: "NVDA", source: "follow" }, { owner_hash: "o".repeat(64), symbol: "BRK-B", source: "follow" }], expect.anything());
    vi.doUnmock("@/lib/server/archive");
  });
});

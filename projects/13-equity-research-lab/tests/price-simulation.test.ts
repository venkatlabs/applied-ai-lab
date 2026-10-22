import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_RETURNS, hashSeed, historicalRange, type HistoricalRange, type MonthlyPrice } from "../lib/price-simulation";
import { HistoricalRange as Panel } from "../components/HistoricalRange";
import type { ResearchRun } from "../lib/types";

const months = (n: number, f: (i: number) => number): MonthlyPrice[] => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2020, i, 28)); return { date: d.toISOString().slice(0, 10), close: f(i) };
});
const ok = (r: ReturnType<typeof historicalRange>): HistoricalRange => { if ("unavailable" in r) throw new Error(r.unavailable); return r; };
// A deterministic wobble, so returns vary but the result is reproducible.
const wobbly = (i: number) => 100 * Math.exp(0.01 * i + 0.08 * Math.sin(i * 1.7));

describe("historicalRange", () => {
  it("is reproducible for the same history and seed, and changes with the seed", () => {
    const a = ok(historicalRange(months(90, wobbly), { seed: 1 })), b = ok(historicalRange(months(90, wobbly), { seed: 1 })), c = ok(historicalRange(months(90, wobbly), { seed: 2 }));
    expect(a).toEqual(b); expect(a.results[0].p50).not.toBe(c.results[0].p50);
  });
  it("orders the percentiles and keeps every probability between 0 and 1", () => {
    const r = ok(historicalRange(months(90, wobbly)));
    for (const x of r.results) {
      expect(x.p10).toBeLessThanOrEqual(x.p50); expect(x.p50).toBeLessThanOrEqual(x.p90);
      for (const p of [x.chanceBeatsHurdle, x.chanceGain, x.chanceBigLoss]) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1); }
      expect(x.chanceBeatsHurdle).toBeLessThanOrEqual(x.chanceGain);
    }
    expect(r.observations).toBe(89); expect(r.months).toBe(12);
  });
  it("a perfectly steady climb has no risk of loss and the zero-drift version is flat", () => {
    const r = ok(historicalRange(months(80, i => 100 * 1.01 ** i)));
    expect(r.results[0].chanceBigLoss).toBe(0); expect(r.results[0].chanceGain).toBe(1);
    expect(r.results[0].p50).toBeCloseTo(1.01 ** 12, 6);
    expect(r.results[1].p10).toBeCloseTo(1, 6); expect(r.results[1].p90).toBeCloseTo(1, 6); expect(r.annualVolatility).toBeCloseTo(0, 8);
  });
  it("the zero-drift median stays near today's price while the as-it-happened version keeps the past drift", () => {
    const r = ok(historicalRange(months(120, wobbly)));
    expect(Math.abs(r.results[1].p50 - 1)).toBeLessThan(0.12); expect(r.results[0].p50).toBeGreaterThan(r.results[1].p50);
  });
  it("says why it cannot run: too little history, invalid prices, or gaps that are not months", () => {
    expect(historicalRange(months(MIN_RETURNS, wobbly))).toEqual({ unavailable: expect.stringContaining("usable monthly returns") });
    expect(historicalRange([...months(70, wobbly), { date: "2026-01-28", close: -5 }])).toEqual({ unavailable: expect.stringContaining("invalid") });
    const yearly = Array.from({ length: 80 }, (_, i) => ({ date: `${2000 + i}-01-15`, close: 100 + i }));
    expect(historicalRange(yearly)).toEqual({ unavailable: expect.stringContaining("usable monthly returns") });
  });
  it("hashes tickers to stable seeds", () => { expect(hashSeed("ABC:2026-09-30")).toBe(hashSeed("ABC:2026-09-30")); expect(hashSeed("ABC")).not.toBe(hashSeed("ABD")); });
});

describe("/api/simulation", () => {
  afterEach(() => { vi.doUnmock("@/lib/server/portfolio-history"); vi.resetModules(); });
  const post = (body: unknown, origin = "https://lab.test") => new Request("https://lab.test/api/simulation", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  it("rejects foreign origins and bad tickers, and returns a range from cached history", async () => {
    vi.doMock("@/lib/server/portfolio-history", () => ({ getPortfolioHistory: async () => ({ symbol: "ABC", prices: months(90, wobbly), source: "src" }) }));
    const { POST, GET } = await import("../app/api/simulation/route");
    expect(GET().status).toBe(405);
    expect((await POST(post({ ticker: "ABC" }, "https://evil.test") as never)).status).toBe(403);
    expect((await POST(post({ ticker: "<x>" }) as never)).status).toBe(400);
    const res = await POST(post({ ticker: "abc" }) as never);
    expect(res.status).toBe(200); expect((await res.json()).range.results).toHaveLength(2);
  });
  it("reports unavailable history clearly instead of inventing a range", async () => {
    vi.doMock("@/lib/server/portfolio-history", () => ({ getPortfolioHistory: async () => ({ symbol: "NEW", prices: months(20, wobbly), source: "src" }) }));
    const { POST } = await import("../app/api/simulation/route");
    const res = await POST(post({ ticker: "NEW" }) as never);
    expect(res.status).toBe(422); expect((await res.json()).error).toContain("usable monthly returns");
  });
});

describe("HistoricalRange panel", () => {
  it("offers a free on-demand button for live reports and nothing for demo data", () => {
    const run = { ticker: "ABC", dataMode: "live", asOfPrice: 100, analyzedAt: "2026-10-15T00:00:00Z" } as unknown as ResearchRun;
    const html = renderToStaticMarkup(React.createElement(Panel, { run }));
    expect(html).toContain("Show historical range (free)"); expect(html).toContain("not a forecast");
    expect(renderToStaticMarkup(React.createElement(Panel, { run: { ...run, dataMode: "demo" } as ResearchRun }))).toBe("");
  });
});

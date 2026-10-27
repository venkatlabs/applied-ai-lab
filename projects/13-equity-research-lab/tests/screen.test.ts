import { describe, expect, it, vi } from "vitest";
import { buildScreen, SCREEN_THRESHOLDS } from "../lib/screen";
import { guardedResearch, ResearchFailed } from "../lib/server/guarded-research";
import { researchOutcome } from "../lib/outcome";
import { buildStockRows } from "../lib/stock-list";
import type { ResearchRun } from "../lib/types";

const strong = { price: 100, priceAvg50: 90, priceAvg200: 80, netIncome: 5, freeCashFlow: 4, operatingCashFlow: 6, cash: 50, debt: 10, intrinsic: { available: true, upsidePct: 22.5 }, growth: 0.15, peerRelativeDiscount: 0.2 };

describe("buildScreen", () => {
  it("calls a cheap, growing, profitable stock worth a deep look and reads upsidePct as percent", () => {
    const s = buildScreen(strong);
    expect(s.label).toBe("Worth a deep look"); expect(s.total).toBe(6); expect(s.missing).toEqual([]);
    expect(s.signals.find(x => x.key === "valuation")!.detail).toContain("23% above");
    expect(buildScreen({ ...strong, intrinsic: { available: true, upsidePct: 4 } }).signals.find(x => x.key === "valuation")!.score).toBe(0);
  });
  it("skips a loss-making, expensive, falling stock", () => {
    const s = buildScreen({ price: 50, priceAvg50: 60, priceAvg200: 70, netIncome: -5, freeCashFlow: -3, cash: 1, debt: 20, intrinsic: { available: true, upsidePct: -40 }, growth: 0.01, peerRelativeDiscount: -0.5 });
    expect(s.label).toBe("Skip for now"); expect(s.total).toBeLessThanOrEqual(SCREEN_THRESHOLDS.skip);
  });
  it("treats missing inputs as neutral, lists them, and never invents a result", () => {
    const s = buildScreen({ price: 100 });
    expect(s.label).toBe("Mixed"); expect(s.total).toBe(0); expect(s.missing).toHaveLength(6);
    expect(buildScreen({ ...strong, intrinsic: { available: false } }).missing).toContain("a modeled value");
  });
});

const lightRun = (over: Record<string, unknown> = {}) => ({ id: "l1", ticker: "BAC", companyName: "BofA", analyzedAt: "2026-10-23T12:00:00Z", asOfPrice: 40, dataMode: "live", tier: "light", score: 0, screen: buildScreen(strong), notes: [], ...over }) as unknown as ResearchRun;

describe("quick screens in the product", () => {
  it("a screen is never a verdict: the outcome stays 'Not researched' and carries the screen", () => {
    const o = researchOutcome(lightRun(), new Date("2026-10-23T13:00:00Z"));
    expect(o.verdict).toBe("Not researched"); expect(o.score).toBeNull(); expect(o.confidence).toBeNull();
    expect(o.screen?.label).toBe("Worth a deep look"); expect(o.headline).toContain("No AI was used");
  });
  it("a screened stock is listed only when you own or follow it; an owned stock with no research at all comes before one that has a screen", () => {
    const now = new Date("2026-10-23T13:00:00Z");
    expect(buildStockRows({ owned: [], following: [], runs: [lightRun()], now })).toEqual([]);
    const rows = buildStockRows({ owned: ["BAC", "KO"], following: [], runs: [lightRun()], now });
    expect(rows.map(r => r.symbol)).toEqual(["KO", "BAC"]); expect(rows[1].outcome.screen).not.toBeNull(); expect(rows[1].priority).toBe(2);
  });
  it("a light run saves for free and needs a screen; a failed screen is an error, not a saved report", async () => {
    const d = (run: ResearchRun) => ({ claim: vi.fn(async () => {}), run: async () => run, save: vi.fn(async (r: ResearchRun) => ({ ...r, storage: "cloud" as const })), release: vi.fn(async () => {}), keepUnrated: false, tier: "light" as const });
    const ok = d(lightRun()); expect((await guardedResearch(ok)).storage).toBe("cloud"); expect(ok.claim).toHaveBeenCalledTimes(1);
    const bad = d(lightRun({ screen: undefined, notes: ["Live research stopped before AI synthesis because no verified current price was available."] }));
    await expect(guardedResearch(bad)).rejects.toBeInstanceOf(ResearchFailed); expect(bad.save).not.toHaveBeenCalled();
  });
});

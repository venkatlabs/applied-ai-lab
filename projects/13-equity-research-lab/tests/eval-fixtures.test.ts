import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { researchOutcome } from "../lib/outcome";
import { hurdleView } from "../lib/hurdle";
import { reportQuality } from "../lib/report-quality";
import { seedTriggers } from "../lib/triggers";
import type { ResearchRun } from "../lib/types";

type Expect = { verdict: string; confidence?: string; scoreMin?: number; scoreMax?: number; needsRefresh?: boolean; hurdleClears?: boolean; coverageMinPct?: number; dateIssues?: number };
const manifest = JSON.parse(readFileSync(new URL("../evals/manifest.json", import.meta.url), "utf8")) as { now: string; fixtures: { file: string; expect: Expect }[] };
const load = (file: string) => JSON.parse(readFileSync(new URL(`../evals/fixtures/${file}`, import.meta.url), "utf8")) as ResearchRun;
const now = new Date(manifest.now);

describe("fixed full-report evaluation cases (see evals/README.md)", () => {
  for (const { file, expect: want } of manifest.fixtures) {
    it(`${file}: verdict, confidence, hurdle, sourcing and dates`, () => {
      const run = load(file), o = researchOutcome(run, now), q = reportQuality(run);
      expect(o.verdict).toBe(want.verdict);
      if (want.confidence) expect(o.confidence).toBe(want.confidence);
      if (want.scoreMin !== undefined) expect(o.score).toBeGreaterThanOrEqual(want.scoreMin);
      if (want.scoreMax !== undefined) expect(o.score).toBeLessThanOrEqual(want.scoreMax);
      if (want.needsRefresh !== undefined) expect(o.needsRefresh).toBe(want.needsRefresh);
      if (want.hurdleClears !== undefined) expect(hurdleView(run)?.clears).toBe(want.hurdleClears);
      if (want.coverageMinPct !== undefined) expect(q.citationCoverage.pct).toBeGreaterThanOrEqual(want.coverageMinPct);
      if (want.dateIssues !== undefined) expect(q.dateIssues).toHaveLength(want.dateIssues);
    });
  }
  it("no fixture uses information from after its own report date (no look-ahead)", () => {
    for (const { file } of manifest.fixtures) {
      const run = load(file), at = Date.parse(run.analyzedAt);
      expect(Date.parse(run.marketAsOf ?? run.analyzedAt)).toBeLessThanOrEqual(at);
      for (const f of Object.values(run.investmentCase!.factors)) if (f.evidenceDate) expect(Date.parse(f.evidenceDate)).toBeLessThanOrEqual(at);
    }
  });
  it("positive headlines do not outweigh weak fundamentals, and events never change the verdict", () => {
    const run = load("sentiment-vs-fundamentals.json"), without = { ...run, currentAffairs: undefined } as ResearchRun;
    expect(researchOutcome(run, now)).toMatchObject({ verdict: researchOutcome(without, now).verdict, score: researchOutcome(without, now).score });
  });
  it("five-case fixtures are complete and the hurdle price is consistent with the expected value", () => {
    const run = load("compounder-complete.json"), h = hurdleView(run)!;
    expect(run.scenarioDistribution!.cases).toHaveLength(5);
    expect(run.scenarioDistribution!.cases.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(h.hurdlePrice * (1 + h.hurdle)).toBeCloseTo(h.expectedPrice, 6);
  });
  it("triggers can be seeded from every fixture without inventing a price threshold for kill triggers", () => {
    for (const { file } of manifest.fixtures) for (const s of seedTriggers(load(file))) if (s.kind === "kill") expect(s.threshold).toBeNull();
  });
});

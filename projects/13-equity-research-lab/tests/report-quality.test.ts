import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { reportQuality } from "../lib/report-quality";
import { ReportQuality } from "../components/ReportQuality";
import type { ResearchRun } from "../lib/types";

const url = "https://issuer.example/a";
const run = (over: Record<string, unknown> = {}) => ({
  ticker: "ABC", analyzedAt: "2026-10-15T00:00:00Z", dataMode: "live", skillVersion: "v1", citations: [{ url, publishedAt: "2026-09-20" }],
  investmentCase: { factors: {
    growth: { rating: "Strong", reason: "r", evidenceDate: "2026-09-01", sources: [url] },
    cash: { rating: "Weak", reason: "r", evidenceDate: "2026-09-15", sources: ["https://not-in-report.example/x"] },
    valuation: { rating: "Unknown", reason: "", evidenceDate: "", sources: [] },
    competition: { rating: "Mixed", reason: "r", evidenceDate: "not a date", sources: [url] },
    execution: { rating: "Mixed", reason: "r", evidenceDate: "2026-10-20", sources: [url] },
    market: { rating: "Mixed", reason: "r", evidenceDate: "2026-10-01", sources: [] } } },
  ...over }) as unknown as ResearchRun;

describe("reportQuality", () => {
  it("counts only sources that belong to the report, skips unknown factors and lists the uncited claims", () => {
    const q = reportQuality(run());
    expect(q.citationCoverage).toMatchObject({ cited: 3, total: 5, pct: 60 });
    expect(q.citationCoverage.uncited.join(" ")).toContain("Profit, cash and funding");
    expect(q.citationCoverage.uncited).toHaveLength(2);
  });
  it("flags bad, future and inconsistent dates but tolerates a source dated near its evidence", () => {
    const issues = reportQuality(run()).dateIssues.map(i => i.detail).join(" | ");
    expect(issues).toContain("missing or not a valid date"); expect(issues).toContain("after the report date");
    expect(issues).toContain("later than the evidence it supports");
    expect(reportQuality(run({ citations: [{ url, publishedAt: "2026-09-05" }] })).dateIssues.some(i => i.detail.includes("later than the evidence"))).toBe(false);
  });
  it("reports cost, time and version, and says so when cost was not recorded", () => {
    const q = reportQuality(run({ cost: { attempts: [{}, {}], estimatedUSD: 0.42, complete: true, note: "", durationMs: 95400 } }));
    expect(q.cost).toEqual({ estimatedUSD: 0.42, complete: true, seconds: 95, attempts: 2 }); expect(q.version).toBe("v1");
    expect(reportQuality(run()).cost).toBeNull();
  });
  it("renders a readable summary and nothing for demo data", () => {
    const html = renderToStaticMarkup(React.createElement(ReportQuality, { run: run({ cost: { attempts: [{}], estimatedUSD: 0.5, complete: true, note: "", durationMs: 60000 } }) }));
    expect(html).toContain("3 of 5 claims (60%)"); expect(html).toContain("about $0.50"); expect(html).toContain("60s");
    expect(renderToStaticMarkup(React.createElement(ReportQuality, { run: run({ dataMode: "demo" }) }))).toBe("");
  });
});

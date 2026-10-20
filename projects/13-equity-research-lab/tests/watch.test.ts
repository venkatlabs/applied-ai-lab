import { describe, expect, it } from "vitest";
import { alertForStatusChange, classifyEdit, classifyRemoval, evaluateTrigger, seedTriggers, triggerInputSchema, type Trigger } from "../lib/triggers";
import { planMonitor } from "../lib/monitor";
import { buildCalendar, dueForRefresh, weekStart } from "../lib/calendar";
import { buildDigest } from "../lib/digest";
import type { ResearchRun } from "../lib/types";

const trig = (over: Partial<Trigger> = {}): Trigger => ({ id: "t1", symbol: "ABC", kind: "kill", text: "Revenue falls two quarters", metric: "manual", threshold: null, due: null, status: "armed", source: "user", reportId: null, evidence: "", createdAt: "2026-10-01", updatedAt: "2026-10-01", ...over });
const fields = (t: Trigger) => ({ kind: t.kind, text: t.text, metric: t.metric, threshold: t.threshold, due: t.due, status: t.status });

describe("goalpost detection", () => {
  const kill = trig({ metric: "price_below", threshold: 80, due: "2026-11-01" });
  it("flags loosening a kill trigger and allows tightening", () => {
    expect(classifyEdit(fields(kill), { ...fields(kill), threshold: 70 }).goalpost).toBe(true);
    expect(classifyEdit(fields(kill), { ...fields(kill), threshold: 90 }).goalpost).toBe(false);
    expect(classifyEdit(fields(kill), { ...fields(kill), due: "2026-12-01" }).goalpost).toBe(true);
    expect(classifyEdit(fields(kill), { ...fields(kill), due: null }).goalpost).toBe(true);
    expect(classifyEdit(fields(kill), { ...fields(kill), due: "2026-10-20" }).goalpost).toBe(false);
    expect(classifyEdit(fields(kill), { ...fields(kill), text: "Softer wording" }).goalpost).toBe(true);
    expect(classifyEdit(fields(kill), { ...fields(kill), metric: "manual", threshold: null }).goalpost).toBe(true);
  });
  it("treats raising a price_above kill threshold and clearing a tripped trigger as loosening", () => {
    const up = trig({ metric: "price_above", threshold: 200 });
    expect(classifyEdit(fields(up), { ...fields(up), threshold: 250 }).goalpost).toBe(true);
    expect(classifyEdit(fields(up), { ...fields(up), threshold: 150 }).goalpost).toBe(false);
    const tripped = trig({ status: "tripped" });
    expect(classifyEdit(fields(tripped), { ...fields(tripped), status: "armed" }).goalpost).toBe(true);
  });
  it("never flags upgrade triggers, and flags only kill removals", () => {
    const up = trig({ kind: "upgrade", metric: "price_below", threshold: 50 });
    expect(classifyEdit(fields(up), { ...fields(up), threshold: 10, text: "x y z" }).goalpost).toBe(false);
    expect(classifyRemoval(up).goalpost).toBe(false); expect(classifyRemoval(trig()).goalpost).toBe(true);
  });
});

describe("trigger evaluation", () => {
  it("trips price triggers, warns inside 5%, and never auto-trips manual ones", () => {
    const below = trig({ metric: "price_below", threshold: 80 });
    expect(evaluateTrigger(below, 79, "2026-10-20")).toMatchObject({ status: "tripped" });
    expect(evaluateTrigger(below, 83, "2026-10-20")).toMatchObject({ status: "watch" });
    expect(evaluateTrigger(below, 100, "2026-10-20")).toBeNull();
    expect(evaluateTrigger(trig({ metric: "price_above", threshold: 120 }), 121, "2026-10-20")).toMatchObject({ status: "tripped" });
    expect(evaluateTrigger(trig({ due: "2026-10-01" }), null, "2026-10-20")).toMatchObject({ status: "watch" });
    expect(evaluateTrigger(trig({ due: "2026-12-01" }), null, "2026-10-20")).toBeNull();
  });
  it("keeps tripped sticky, lets watch relax, and ignores missing prices", () => {
    expect(evaluateTrigger(trig({ status: "tripped", metric: "price_below", threshold: 80 }), 200, "2026-10-20")).toBeNull();
    expect(evaluateTrigger(trig({ status: "watch", metric: "price_below", threshold: 80 }), 200, "2026-10-20")).toMatchObject({ status: "armed" });
    expect(evaluateTrigger(trig({ metric: "price_below", threshold: 80 }), null, "2026-10-20")).toBeNull();
  });
  it("words alerts so an upgrade trip asks for a re-review, not a verdict change", () => {
    const a = alertForStatusChange(trig({ kind: "upgrade", metric: "price_below", threshold: 50 }), { status: "tripped", evidence: "e" })!;
    expect(a.direction).toBe("bull"); expect(a.headline).toContain("verdict is unchanged");
    expect(alertForStatusChange(trig(), { status: "tripped", evidence: "e" })!.direction).toBe("bear");
    expect(alertForStatusChange(trig(), { status: "armed", evidence: "" })).toBeNull();
  });
  it("validates input", () => {
    expect(triggerInputSchema.safeParse({ symbol: "abc", kind: "kill", text: "ok text", metric: "price_below" }).success).toBe(false);
    expect(triggerInputSchema.safeParse({ symbol: "abc", kind: "kill", text: "ok text", metric: "price_below", threshold: 10 }).success).toBe(true);
    expect(triggerInputSchema.safeParse({ symbol: "abc", kind: "kill", text: "ok text", due: "2026-13-45" }).success).toBe(false);
  });
});

describe("seedTriggers", () => {
  const cases = [60, 80, 110, 140, 200].map((price, i) => ({ price, weight: [10, 20, 40, 20, 10][i] }));
  const run = { ticker: "ABC", asOfPrice: 100, analyzedAt: "2026-10-10T00:00:00Z", thesisKillers: ["Cash runs out", "Cash runs out", "Margins collapse"], scenarioDistribution: { cases },
    thesisReview: { checks: [{ reviewCondition: "Debt exceeds cash", reviewBy: "2026-12-01" }, { reviewCondition: "", reviewBy: "" }], gaps: [] } } as unknown as ResearchRun;
  it("creates kill triggers from the report and a hurdle-price upgrade trigger, without inventing thresholds", () => {
    const seeds = seedTriggers(run);
    expect(seeds.filter(s => s.kind === "kill")).toHaveLength(3);
    expect(seeds.find(s => s.text.includes("Debt exceeds cash"))?.due).toBe("2026-12-01");
    const up = seeds.find(s => s.kind === "upgrade")!;
    expect(up).toMatchObject({ metric: "price_below", threshold: 99.13, source: "hurdle" });
    expect(seeds.filter(s => s.kind === "kill").every(s => s.threshold === null)).toBe(true);
  });
  it("skips triggers that already exist", () => {
    expect(seedTriggers(run, [{ text: "cash runs out!" }]).filter(s => s.kind === "kill")).toHaveLength(2);
  });
});

describe("monitor plan", () => {
  const cases = [60, 80, 110, 140, 200].map((price, i) => ({ price, weight: [10, 20, 40, 20, 10][i] }));
  const report = { ticker: "ABC", asOfPrice: 100, analyzedAt: "2026-10-10T00:00:00Z", marketAsOf: "2026-10-09", scenarioDistribution: { cases } } as unknown as ResearchRun;
  it("flags trigger changes and hurdle crossings once", () => {
    const t = trig({ metric: "price_below", threshold: 80 });
    const plan = planMonitor({ today: "2026-10-20", prices: { ABC: { price: 95, date: "2026-10-20" } }, triggers: [t], latestReports: { ABC: report }, prior: [{ symbol: "ABC", inBuyZone: false }] });
    expect(plan.states[0]).toMatchObject({ symbol: "ABC", inBuyZone: true });
    expect(plan.alerts.map(a => a.kind)).toEqual(["hurdle"]);
    const again = planMonitor({ today: "2026-10-21", prices: { ABC: { price: 95, date: "2026-10-21" } }, triggers: [], latestReports: { ABC: report }, prior: [{ symbol: "ABC", inBuyZone: true }] });
    expect(again.alerts).toHaveLength(0);
    const trip = planMonitor({ today: "2026-10-20", prices: { ABC: { price: 70, date: "2026-10-20" } }, triggers: [t], latestReports: {}, prior: [] });
    expect(trip.statusUpdates[0]).toMatchObject({ status: "tripped", previous: "armed" }); expect(trip.alerts[0].direction).toBe("bear");
  });
  it("does nothing for stocks without a price, and does not alert on the first observation", () => {
    expect(planMonitor({ today: "2026-10-20", prices: { ABC: undefined }, triggers: [trig({ metric: "price_below", threshold: 80 })], latestReports: { ABC: report }, prior: [] })).toEqual({ statusUpdates: [], alerts: [], states: [] });
    expect(planMonitor({ today: "2026-10-20", prices: { ABC: { price: 95, date: "2026-10-20" } }, triggers: [], latestReports: { ABC: report }, prior: [] }).alerts).toHaveLength(0);
  });
});

describe("calendar and digest", () => {
  it("groups upcoming tests by Monday-start week and lists overdue ones", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19"); expect(weekStart("2026-10-18")).toBe("2026-10-12");
    const cal = buildCalendar([trig({ due: "2026-10-22" }), trig({ id: "t2", due: "2026-10-01", text: "Old" }), trig({ id: "t3", due: "2027-06-01", text: "Far" }), trig({ id: "t4", due: "2026-10-23", status: "tripped", text: "Done" })], {}, "2026-10-20");
    expect(cal.weeks).toHaveLength(1); expect(cal.weeks[0]).toMatchObject({ weekStart: "2026-10-19" }); expect(cal.overdue.map(i => i.label)).toEqual(["Old"]);
  });
  it("includes report review dates once and finds stocks due for a refresh", () => {
    const run = { thesisReview: { checks: [{ reviewBy: "2026-10-05", reviewCondition: "Cash falls" }] } } as unknown as ResearchRun;
    const cal = buildCalendar([trig({ due: "2026-10-05", text: "Reconsider if: Cash falls" })], { ABC: run }, "2026-10-20");
    expect(cal.overdue).toHaveLength(1);
    expect(dueForRefresh(cal, { ABC: "2026-09-30T00:00:00Z" })).toEqual([{ symbol: "ABC", date: "2026-10-05", reason: expect.stringContaining("passed") }]);
    expect(dueForRefresh(cal, { ABC: "2026-10-10T00:00:00Z" })).toEqual([]);
  });
  it("summarises only the week and says when it was quiet", () => {
    const quiet = buildDigest({ weekEnding: "2026-10-18", alerts: [], triggers: [], goalposts: [], verdictChanges: [], upcoming: [] });
    expect(quiet.headline).toBe("Quiet week: nothing tripped or changed.");
    const d = buildDigest({ weekEnding: "2026-10-18", alerts: [{ at: "2026-10-15T00:00:00Z", symbol: "A", kind: "trigger", direction: "bear", headline: "h" }, { at: "2026-09-01T00:00:00Z", symbol: "A", kind: "trigger", direction: "bear", headline: "old" }],
      triggers: [trig({ status: "tripped" }), trig({ id: "w", status: "watch" })], goalposts: [{ at: "2026-10-16T00:00:00Z", symbol: "ABC", reason: "Loosened" }], verdictChanges: [{ symbol: "ABC", from: "Hold", to: "Trim", at: "2026-10-17T00:00:00Z" }],
      upcoming: [{ date: "2026-10-25", symbol: "ABC", label: "Test", kind: "kill test", triggerId: null }, { date: "2027-01-01", symbol: "ABC", label: "Far", kind: "kill test", triggerId: null }] });
    expect(d.alerts).toBe(1); expect(d.headline).toContain("1 trigger tripped"); expect(d.verdictChanges).toHaveLength(1); expect(d.goalposts).toHaveLength(1); expect(d.upcoming).toHaveLength(1);
  });
});

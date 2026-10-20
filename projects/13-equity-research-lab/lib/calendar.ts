import type { ResearchRun } from "./types";
import type { Trigger } from "./triggers";
import { validDate } from "./thesis-review";

export type CalendarItem = { date: string; symbol: string; label: string; kind: "kill test" | "upgrade test" | "review date"; triggerId: string | null };
export type CalendarWeek = { weekStart: string; items: CalendarItem[] };
const dayMs = 86400000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * dayMs).toISOString().slice(0, 10);
}

/** Dated tests across your stocks: trigger test dates plus the review dates in each stock's latest report. */
export function buildCalendar(triggers: Trigger[], latestReports: Record<string, ResearchRun | undefined>, today: string, weeks = 8): { overdue: CalendarItem[]; weeks: CalendarWeek[] } {
  const items: CalendarItem[] = [];
  const seen = new Set<string>();
  const add = (i: CalendarItem) => { const k = `${i.symbol}|${i.date}|${norm(i.label)}`; if (!seen.has(k) && validDate(i.date)) { seen.add(k); items.push(i); } };
  for (const t of triggers) if (t.due && t.status !== "tripped") add({ date: t.due, symbol: t.symbol, label: t.text, kind: t.kind === "kill" ? "kill test" : "upgrade test", triggerId: t.id });
  for (const [symbol, run] of Object.entries(latestReports))
    for (const c of run?.thesisReview?.checks ?? []) if (c.reviewBy && c.reviewCondition) add({ date: c.reviewBy, symbol, label: `Reconsider if: ${c.reviewCondition}`, kind: "review date", triggerId: null });
  items.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  const horizon = new Date(new Date(`${today}T00:00:00Z`).getTime() + weeks * 7 * dayMs).toISOString().slice(0, 10);
  const grouped = new Map<string, CalendarItem[]>();
  for (const i of items.filter(i => i.date >= today && i.date <= horizon)) grouped.set(weekStart(i.date), [...(grouped.get(weekStart(i.date)) ?? []), i]);
  return { overdue: items.filter(i => i.date < today), weeks: [...grouped.entries()].map(([weekStart, list]) => ({ weekStart, items: list })) };
}

/** Owned or followed stocks where a dated test has passed since the last report, so a refresh could resolve it. */
export function dueForRefresh(calendar: { overdue: CalendarItem[] }, reportDates: Record<string, string | undefined>): { symbol: string; date: string; reason: string }[] {
  const out = new Map<string, { symbol: string; date: string; reason: string }>();
  for (const i of calendar.overdue) {
    const reported = reportDates[i.symbol];
    if (reported && reported.slice(0, 10) >= i.date) continue;
    if (!out.has(i.symbol) || out.get(i.symbol)!.date < i.date) out.set(i.symbol, { symbol: i.symbol, date: i.date, reason: `${i.kind} date ${i.date} has passed since the last report` });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

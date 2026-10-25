import type { Trigger } from "./triggers";
import type { CalendarItem } from "./calendar";

export type DigestAlert = { at: string; symbol: string; kind: string; direction: string; headline: string };
export type VerdictChange = { symbol: string; from: string; to: string; at: string };
export type Digest = {
  weekEnding: string; headline: string; tripped: string[]; watch: string[]; verdictChanges: VerdictChange[]; goalposts: string[]; upcoming: { date: string; symbol: string; label: string }[]; alerts: number;
};

/** One short summary of the week. Pure, so the same input always gives the same digest. */
export function buildDigest(input: { weekEnding: string; alerts: DigestAlert[]; triggers: Trigger[]; goalposts: { at: string; symbol: string; reason: string }[]; verdictChanges: VerdictChange[]; upcoming: CalendarItem[] }): Digest {
  const since = new Date(new Date(`${input.weekEnding}T00:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const inWeek = <T extends { at: string }>(xs: T[]) => xs.filter(x => x.at.slice(0, 10) > since && x.at.slice(0, 10) <= input.weekEnding);
  const until = new Date(new Date(`${input.weekEnding}T00:00:00Z`).getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const tripped = input.triggers.filter(t => t.status === "tripped").map(t => `${t.symbol} ${t.kind}: ${t.text}`);
  const watch = input.triggers.filter(t => t.status === "watch").map(t => `${t.symbol} ${t.kind}: ${t.text}`);
  const changes = inWeek(input.verdictChanges), goalposts = inWeek(input.goalposts).map(g => `${g.symbol}: ${g.reason}`), alerts = inWeek(input.alerts).length;
  const upcoming = input.upcoming.filter(i => i.date > input.weekEnding && i.date <= until).slice(0, 12).map(i => ({ date: i.date, symbol: i.symbol, label: i.label }));
  const parts = [tripped.length && `${tripped.length} trigger${tripped.length === 1 ? "" : "s"} tripped`, watch.length && `${watch.length} on watch`, changes.length && `${changes.length} verdict change${changes.length === 1 ? "" : "s"}`, goalposts.length && `${goalposts.length} goalpost move${goalposts.length === 1 ? "" : "s"}`].filter(Boolean);
  return { weekEnding: input.weekEnding, headline: parts.length ? parts.join(", ") + "." : "Quiet week: nothing tripped or changed.", tripped, watch, verdictChanges: changes, goalposts, upcoming, alerts };
}

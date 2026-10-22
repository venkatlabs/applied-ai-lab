import type { ResearchRun } from "./types";
import { factorKeys, factorLabels } from "./investment";

/**
 * Measurable properties of a saved report, so quality is checked by code and not by impression:
 * how much of it is tied to a source, whether evidence dates are consistent with those sources, and what it cost.
 * Pure and read-only. It never changes a verdict.
 */
export type DateIssue = { where: string; detail: string };
export type ReportQuality = {
  citationCoverage: { cited: number; total: number; pct: number | null; uncited: string[] };
  dateIssues: DateIssue[];
  cost: { estimatedUSD: number | null; complete: boolean; seconds: number | null; attempts: number } | null;
  version: string;
};
const dayMs = 86400000;
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/** A source date can legitimately precede the stated evidence period; flag only a source clearly NEWER than the evidence date. */
export const DATE_TOLERANCE_DAYS = 7;

export function reportQuality(run: ResearchRun): ReportQuality {
  const urls = new Map((run.citations ?? []).map(c => [c.url, c]));
  const uncited: string[] = [];
  let cited = 0, total = 0;
  const issues: DateIssue[] = [];
  const analyzed = Date.parse(run.analyzedAt);
  const known = (u: string) => urls.has(u);

  const thesis = run.investmentCase;
  if (thesis) for (const k of factorKeys) {
    const f = thesis.factors[k];
    if (f.rating === "Unknown") continue;
    total++;
    const sources = (f.sources ?? []).filter(known);
    if (sources.length) cited++; else uncited.push(`${factorLabels[k]}: rated ${f.rating} without a source from this report`);
    if (!isDate(f.evidenceDate)) issues.push({ where: factorLabels[k], detail: "The evidence date is missing or not a valid date." });
    else {
      if (Date.parse(f.evidenceDate) > analyzed + dayMs) issues.push({ where: factorLabels[k], detail: `The evidence date ${f.evidenceDate} is after the report date.` });
      for (const u of sources) {
        const published = urls.get(u)?.publishedAt?.slice(0, 10);
        if (isDate(published) && (Date.parse(published) - Date.parse(f.evidenceDate)) / dayMs > DATE_TOLERANCE_DAYS)
          issues.push({ where: factorLabels[k], detail: `Evidence dated ${f.evidenceDate} cites a source published ${published}, which is later than the evidence it supports.` });
      }
    }
  }
  for (const e of run.currentAffairs?.events ?? []) { total++; if (known(e.source)) cited++; else uncited.push(`Event "${e.headline}" has no source from this report`); }
  for (const c of run.thesisReview?.checks ?? []) if (c.observation?.trim()) { total++; if ((c.sources ?? []).some(known)) cited++; else uncited.push(`Check "${c.question}" has an observation without a source`); }

  const c = run.cost;
  return {
    citationCoverage: { cited, total, pct: total ? Math.round((100 * cited) / total) : null, uncited },
    dateIssues: issues,
    cost: c ? { estimatedUSD: c.estimatedUSD, complete: c.complete, seconds: typeof c.durationMs === "number" ? Math.round(c.durationMs / 1000) : null, attempts: c.attempts.length } : null,
    version: run.skillVersion,
  };
}

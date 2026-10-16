import { z } from 'zod';
import type { Citation, ResearchRun } from './types';

export const thesisCheckSchema = z.object({
  question: z.string().max(300),
  observation: z.string().max(700),
  reviewCondition: z.string().max(500),
  evidenceDate: z.string().max(10),
  sources: z.array(z.string().max(2000)).max(4),
  reviewBy: z.string().max(10),
  dateBasis: z.enum(['Reported event', 'Planning assumption', 'Unknown']),
});
export const thesisReviewSchema = z.object({ checks: z.array(thesisCheckSchema).max(3), gaps: z.array(z.string().max(300)).max(4) });
export type ThesisReviewInput = z.infer<typeof thesisReviewSchema>;
export type ThesisCheck = z.infer<typeof thesisCheckSchema> & { evidenceStatus: 'Linked' | 'Missing'; warnings: string[] };
export type ThesisReview = { checks: ThesisCheck[]; gaps: string[] };
const fields = ['question', 'observation', 'reviewCondition', 'evidenceDate', 'reviewBy'];
export const thesisReviewJsonSchema = {
  type: 'object', additionalProperties: false, required: ['checks', 'gaps'], properties: {
    checks: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false,
      required: [...fields, 'sources', 'dateBasis'], properties: {
        ...Object.fromEntries(fields.map(f => [f, { type: 'string' }])),
        sources: { type: 'array', maxItems: 4, items: { type: 'string' } },
        dateBasis: { type: 'string', enum: ['Reported event', 'Planning assumption', 'Unknown'] },
      } } },
    gaps: { type: 'array', maxItems: 4, items: { type: 'string' } },
  },
};

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function safeUrl(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
/** Checks source membership and dates, not the truth or meaning of a cited claim. */
export function validateThesisReview(input: ThesisReviewInput, citations: Citation[], analyzedAt: string): ThesisReview {
  const today = analyzedAt.slice(0, 10);
  const catalog = new Set(citations.map(c => c.url).filter(safeUrl));
  return { gaps: [...input.gaps], checks: input.checks.map(c => {
    const warnings: string[] = [];
    const sources = [...new Set(c.sources.filter(s => safeUrl(s) && catalog.has(s)))];
    const dated = validDate(c.evidenceDate) && validDate(today) && c.evidenceDate <= today;
    const linked = sources.length > 0 && dated && !!c.observation.trim();
    if (sources.length !== new Set(c.sources).size) warnings.push('Some source links were outside the evidence packet and were removed.');
    if (!linked) warnings.push('A dated observation with a source from this report is missing.');
    const reviewBy = validDate(c.reviewBy) && c.reviewBy >= today && c.dateBasis !== 'Unknown' && (c.dateBasis !== 'Reported event' || linked) ? c.reviewBy : '';
    if (c.reviewBy && !reviewBy) warnings.push('The proposed review date could not be used.');
    return { ...c, sources, evidenceDate: dated ? c.evidenceDate : '',
      observation: linked ? c.observation : 'Evidence unavailable. Review the missing information before relying on this check.',
      reviewBy, dateBasis: reviewBy ? c.dateBasis : 'Unknown', evidenceStatus: linked ? 'Linked' : 'Missing', warnings };
  }) };
}

export function thesisReviewStatus(run: ResearchRun | undefined, now = new Date()): string {
  if (!run) return 'No saved report';
  const review = run.thesisReview;
  if (!review?.checks.length) return 'Dated checks unavailable';
  const today = now.toISOString().slice(0, 10);
  const due = review.checks.filter(c => validDate(c.reviewBy) && c.reviewBy <= today).length;
  const missing = review.checks.filter(c => c.evidenceStatus !== 'Linked').length;
  const old = validDate(run.analyzedAt.slice(0, 10)) && (now.getTime() - Date.parse(run.analyzedAt.slice(0, 10))) > 30 * 86400000;
  const labels = [due ? `${due} review${due === 1 ? '' : 's'} due` : '', missing ? `${missing} evidence gap${missing === 1 ? '' : 's'}` : '', review.gaps.length ? `${review.gaps.length} open question${review.gaps.length === 1 ? '' : 's'}` : '', old ? 'Report over 30 days old' : ''];
  return labels.filter(Boolean).join(' · ') || 'Checks available';
}

export function researchQuestions(ticker: string): string[] {
  const general = ['What reported operating result would weaken the case?', 'Is cash generation sustainable after investment spending and dilution?', 'What evidence would justify changing the price or timing assessment?'];
  if (ticker === 'AMZN') return ['Assess AWS, retail and advertising separately: which segment drives the case?', 'Is investment spending producing durable operating cash generation?', 'What reported segment growth or margin deterioration would change the case?'];
  if (['NVDA', 'AMD', 'AVGO', 'QCOM'].includes(ticker)) return ['Who pays for demand, and how concentrated are customers?', 'How much growth depends on a shared customer investment cycle?', 'What would reveal weaker pricing power or excess capacity?'];
  if (['JPM', 'BAC', 'WFC', 'C', 'SOFI', 'NU'].includes(ticker)) return ['Are credit losses and delinquencies worsening for comparable loan vintages?', 'What capital and funding evidence supports resilience?', 'Is growth coming from underwriting quality or greater credit risk?'];
  if (['LMT', 'GD', 'NOC', 'RTX'].includes(ticker)) return ['Does contract backlog convert into cash and profit?', 'Which program cost overruns or customer budget changes threaten the case?', 'What evidence supports durable returns on invested capital?'];
  return general;
}

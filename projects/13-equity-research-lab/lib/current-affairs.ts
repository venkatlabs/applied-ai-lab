import { z } from 'zod';
import type { Citation, ResearchRun } from './types';
import { safeUrl, validDate } from './thesis-review';

/**
 * Structured "what changed" evidence. The model proposes events; code keeps only those tied to a source from this
 * report's own citation catalog with a valid publication date, takes provenance (source title, tier, retrieval time)
 * from the catalog instead of the model, and ranks them deterministically. Source membership shows provenance, not
 * that the cited claim is true or that it explains any price move.
 */
export const eventScopes = ['Company', 'Sector', 'Industry', 'Macro', 'Regulatory', 'Competitor'] as const;
export const evidenceKinds = ['Direct company evidence', 'Sector spillover', 'Model interpretation'] as const;
export const eventDirections = ['Positive', 'Negative', 'Mixed', 'Unclear'] as const;
export const uncertaintyLevels = ['Low', 'Medium', 'High'] as const;
export const STALE_AFTER_DAYS = 90;
export const MAX_EVENTS = 6;

export const currentAffairsEventSchema = z.object({
  headline: z.string().max(200),
  scope: z.enum(eventScopes),
  evidenceKind: z.enum(evidenceKinds),
  eventDate: z.string().max(10),
  publishedDate: z.string().max(10),
  source: z.string().max(2000),
  direction: z.enum(eventDirections),
  mechanism: z.string().max(500),
  uncertainty: z.enum(uncertaintyLevels),
});
export const currentAffairsSchema = z.object({ events: z.array(currentAffairsEventSchema).max(MAX_EVENTS), gaps: z.array(z.string().max(300)).max(4) });
export type CurrentAffairsInput = z.infer<typeof currentAffairsSchema>;

const eventFields = ['headline', 'scope', 'evidenceKind', 'eventDate', 'publishedDate', 'source', 'direction', 'mechanism', 'uncertainty'];
export const currentAffairsJsonSchema = {
  type: 'object', additionalProperties: false, required: ['events', 'gaps'], properties: {
    events: { type: 'array', maxItems: MAX_EVENTS, items: { type: 'object', additionalProperties: false, required: eventFields, properties: {
      headline: { type: 'string' }, eventDate: { type: 'string' }, publishedDate: { type: 'string' }, source: { type: 'string' }, mechanism: { type: 'string' },
      scope: { type: 'string', enum: [...eventScopes] }, evidenceKind: { type: 'string', enum: [...evidenceKinds] },
      direction: { type: 'string', enum: [...eventDirections] }, uncertainty: { type: 'string', enum: [...uncertaintyLevels] },
    } } },
    gaps: { type: 'array', maxItems: 4, items: { type: 'string' } },
  },
};

export type CurrentAffairsEvent = z.infer<typeof currentAffairsEventSchema> & {
  rank: number; sourceTitle: string; sourceName: string; sourceTier: Citation['tier']; retrievedAt: string;
  ageDays: number; stale: boolean; warnings: string[];
};
export type CurrentAffairs = { events: CurrentAffairsEvent[]; gaps: string[]; removed: number };

// A mechanism that explains a price move by a headline is an interpretation, not established causality.
const PRICE_MOVE_CAUSE = /\b(shares?|stock|price|valuation)\b[^.]{0,60}\b(fell|dropped|declined|slid|plunged|tumbled|sank|rose|jumped|surged|rallied|climbed|sold off|sell-?off)\b[^.]{0,40}\b(because|due to|after|on|following|as)\b/i;
const kindOrder: Record<(typeof evidenceKinds)[number], number> = { 'Direct company evidence': 0, 'Sector spillover': 1, 'Model interpretation': 2 };
const dayMs = 86400000;
const daysBetween = (later: string, earlier: string) => Math.floor((Date.parse(later) - Date.parse(earlier)) / dayMs);

export function validateCurrentAffairs(input: CurrentAffairsInput, citations: Citation[], analyzedAt: string): CurrentAffairs {
  const today = analyzedAt.slice(0, 10);
  const catalog = new Map<string, Citation>();
  for (const c of citations) if (safeUrl(c.url) && !catalog.has(c.url)) catalog.set(c.url, c);
  let removed = 0;
  const kept: Omit<CurrentAffairsEvent, 'rank'>[] = [];
  for (const raw of input.events) {
    const citation = catalog.get(raw.source);
    const sourceDate = citation?.publishedAt && validDate(citation.publishedAt.slice(0, 10)) ? citation.publishedAt.slice(0, 10) : '';
    const published = sourceDate || raw.publishedDate;
    if (!citation || !raw.headline.trim() || !raw.mechanism.trim() || !validDate(published) || !validDate(today) || published > today) { removed++; continue; }
    const warnings: string[] = [];
    if (sourceDate && raw.publishedDate !== sourceDate) warnings.push(`Publication date taken from the retrieved source (${sourceDate}), not the model's proposed date.`);
    let eventDate = raw.eventDate;
    if (eventDate && !(validDate(eventDate) && eventDate <= published)) { warnings.push('The proposed event date was unusable and was removed.'); eventDate = ''; }
    let kind = raw.evidenceKind;
    if (kind === 'Direct company evidence' && raw.scope !== 'Company') { kind = 'Sector spillover'; warnings.push('Not a company-specific event, so it is shown as sector spillover.'); }
    if (kind !== 'Model interpretation' && PRICE_MOVE_CAUSE.test(raw.mechanism)) { kind = 'Model interpretation'; warnings.push('Attributing a price move to a headline is an interpretation, not established causality.'); }
    const ageDays = daysBetween(today, published);
    const stale = ageDays > STALE_AFTER_DAYS;
    let uncertainty = raw.uncertainty;
    if ((stale || kind === 'Model interpretation') && uncertainty === 'Low') { uncertainty = 'Medium'; warnings.push('Uncertainty raised: stale or interpretive evidence cannot be low-uncertainty.'); }
    if (stale) warnings.push(`Published ${ageDays} days before this report; treat as background.`);
    kept.push({ ...raw, evidenceKind: kind, eventDate, publishedDate: published, uncertainty, sourceTitle: citation.title, sourceName: citation.source, sourceTier: citation.tier,
      retrievedAt: citation.retrievedAt, ageDays, stale, warnings });
  }
  kept.sort((a, b) => Number(a.stale) - Number(b.stale) || kindOrder[a.evidenceKind] - kindOrder[b.evidenceKind] || b.publishedDate.localeCompare(a.publishedDate) || a.sourceTier - b.sourceTier);
  const events = kept.slice(0, MAX_EVENTS).map((e, i) => ({ ...e, rank: i + 1 }));
  const gaps = [...input.gaps];
  if (removed) gaps.push(`${removed} proposed event${removed === 1 ? ' was' : 's were'} removed: no source from this report's evidence or no valid publication date.`);
  if (!events.length) gaps.push('No dated current-affairs evidence was available in the retrieved sources.');
  else if (!events.some(e => e.evidenceKind === 'Direct company evidence' && !e.stale)) gaps.push('No recent company-specific event was found in the retrieved sources.');
  return { events, gaps, removed };
}

export function currentAffairsStatus(run: Pick<ResearchRun, 'currentAffairs'>): string {
  const ca = run.currentAffairs;
  if (!ca) return 'Not available for this saved report';
  if (!ca.events.length) return 'No dated current-affairs evidence';
  const direct = ca.events.filter(e => e.evidenceKind === 'Direct company evidence').length;
  const newest = ca.events.map(e => e.publishedDate).sort().at(-1);
  return `${ca.events.length} event${ca.events.length === 1 ? '' : 's'} · ${direct} direct company · newest ${newest}`;
}

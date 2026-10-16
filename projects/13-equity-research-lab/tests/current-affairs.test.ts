import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { validateCurrentAffairs, currentAffairsStatus, type CurrentAffairsInput } from '../lib/current-affairs';
import { scoreBreakdown } from '../lib/score-breakdown';
import { singleInvestmentDecision, factorKeys } from '../lib/investment';
import { CurrentAffairsPanel } from '../components/CurrentAffairsPanel';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { DecisionHeader } from '../components/DecisionHeader';
import type { Citation, ResearchRun } from '../lib/types';

const url = 'https://issuer.example/news';
const cite = (over: Partial<Citation> = {}) => ({ url, title: 'Issuer news', source: 'Issuer', publishedAt: '2026-10-10', retrievedAt: '2026-10-15T10:00:00Z', tier: 1, ...over }) as Citation;
const ev = (over: Partial<CurrentAffairsInput['events'][number]> = {}): CurrentAffairsInput['events'][number] => ({
  headline: 'New product launch', scope: 'Company', evidenceKind: 'Direct company evidence', eventDate: '2026-10-09', publishedDate: '2026-10-10', source: url,
  direction: 'Positive', mechanism: 'Could add recurring revenue.', uncertainty: 'Low', ...over });
const input = (events: CurrentAffairsInput['events'], gaps: string[] = []): CurrentAffairsInput => ({ events, gaps });
const at = '2026-10-16T00:00:00Z';

it('keeps sourced events and takes provenance from the citation catalog', () => {
  const r = validateCurrentAffairs(input([ev({ publishedDate: '2026-10-01' })]), [cite()], at);
  expect(r.events).toHaveLength(1);
  expect(r.events[0]).toMatchObject({ publishedDate: '2026-10-10', sourceTitle: 'Issuer news', retrievedAt: '2026-10-15T10:00:00Z', ageDays: 6, stale: false, rank: 1 });
  expect(r.events[0].warnings.join(' ')).toContain('taken from the retrieved source');
});
it('removes events with sources outside the catalog, unsafe URLs or future dates', () => {
  const r = validateCurrentAffairs(input([ev({ source: 'https://other.example/x' }), ev({ source: 'javascript:alert(1)' }), ev()]), [cite({ publishedAt: '2026-12-01' })], at);
  expect(r.events).toHaveLength(0); expect(r.removed).toBe(3);
  expect(r.gaps.join(' ')).toContain('3 proposed events were removed');
});
it('removes events lacking a valid publication date', () => {
  const r = validateCurrentAffairs(input([ev({ publishedDate: 'soon' })]), [cite({ publishedAt: undefined })], at);
  expect(r.events).toHaveLength(0);
  expect(r.gaps).toContain('No dated current-affairs evidence was available in the retrieved sources.');
});
it('downgrades sector items claiming direct evidence and price-move causality; raises low uncertainty for interpretation', () => {
  const r = validateCurrentAffairs(input([ev({ scope: 'Sector' }), ev({ mechanism: 'Shares fell because of the launch.', headline: 'B' })]), [cite()], at);
  const kinds = r.events.map(e => e.evidenceKind).sort();
  expect(kinds).toEqual(['Model interpretation', 'Sector spillover']);
  expect(r.events.find(e => e.evidenceKind === 'Model interpretation')!.uncertainty).toBe('Medium');
});
it('flags stale evidence, ranks fresh direct evidence first and caps the list', () => {
  const old = cite({ url: 'https://old.example/a', publishedAt: '2026-01-01' });
  const r = validateCurrentAffairs(input([ev({ source: old.url, headline: 'Old' }), ev({ headline: 'Fresh' })]), [old, cite()], at);
  expect(r.events.map(e => e.headline)).toEqual(['Fresh', 'Old']);
  expect(r.events[1].stale).toBe(true); expect(r.events[1].uncertainty).toBe('Medium');
  expect(currentAffairsStatus({ currentAffairs: r })).toContain('2 events');
});
it('reports a gap when there is no recent company-specific event', () => {
  const r = validateCurrentAffairs(input([ev({ scope: 'Macro' })]), [cite()], at);
  expect(r.gaps).toContain('No recent company-specific event was found in the retrieved sources.');
});

const factor = (rating: string, sources = [url]) => ({ rating, reason: 'r', evidenceDate: '2026-10-01', sources });
const run = (ratings: Record<string, string>, extra: Partial<ResearchRun> = {}) => ({
  ticker: 'ABC', companyName: 'ABC Co', analyzedAt: '2026-10-16T00:00:00Z', marketAsOf: '2026-10-15', asOfPrice: 10, dataMode: 'live',
  investmentCase: { factors: Object.fromEntries(factorKeys.map(k => [k, factor(ratings[k] ?? 'Strong')])), valuationBasis: 'Peer comparison', valuationBenchmark: '', growthOutlook: 'g', strongestCounterargument: 'c', timing: 'Timing note', changeMind: 'x' },
  ...extra }) as unknown as ResearchRun;

it('score breakdown total equals the decision score', () => {
  for (const r of [run({}), run({ growth: 'Very strong', cash: 'Weak', valuation: 'Mixed' }), run({ valuation: 'Unknown' })]) {
    const b = scoreBreakdown(r)!;
    expect(b.score).toBe(singleInvestmentDecision(r).score);
    if (!b.capped) expect(b.weightedTotal).toBe(b.score);
    expect(b.rows).toHaveLength(6);
  }
  const capped = scoreBreakdown(run({ valuation: 'Unknown', growth: 'Very strong', cash: 'Very strong', competition: 'Very strong', execution: 'Very strong', market: 'Very strong' }))!;
  expect(capped.capped).toBe(true); expect(capped.score).toBe(59);
  expect(scoreBreakdown({ analyzedAt: at } as ResearchRun)).toBeNull();
});
it('renders views with data, legacy and not-rated states', () => {
  const ca = validateCurrentAffairs(input([ev()], ['Nothing on regulation']), [cite()], at);
  const r = run({}, { currentAffairs: ca });
  const html = renderToStaticMarkup(React.createElement(CurrentAffairsPanel, { run: r }));
  expect(html).toContain('New product launch'); expect(html).toContain(`href="${url}"`); expect(html).toContain('retrieved 2026-10-15'); expect(html).toContain('Nothing on regulation');
  expect(renderToStaticMarkup(React.createElement(CurrentAffairsPanel, { run: run({}) }))).toContain('predates current-affairs evidence');
  const sb = renderToStaticMarkup(React.createElement(ScoreBreakdown, { run: r }));
  expect(sb).toContain('Weighted total'); expect(sb).toContain('25%');
  expect(renderToStaticMarkup(React.createElement(ScoreBreakdown, { run: { analyzedAt: at } as ResearchRun }))).toBe('');
  const hdr = renderToStaticMarkup(React.createElement(DecisionHeader, { run: r }));
  expect(hdr).toContain('ABC'); expect(hdr).toContain('/100'); expect(hdr).toContain('1 event');
  expect(renderToStaticMarkup(React.createElement(DecisionHeader, { run: run({}, { marketAsOf: '2026-01-01' }) }))).toContain('Not rated');
});

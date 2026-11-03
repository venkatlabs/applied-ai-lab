import { expect,it } from 'vitest';
import { buildDistribution,distributionSummary,scenarioLabels,type DistributionInput } from '../lib/scenario-distribution';
import type { Citation } from '../lib/types';
const url='https://issuer.example/results';
const citations=[{url}] as Citation[];
function model():DistributionInput {return {basis:'Earnings per share × P/E',weightReason:'Subjective event and execution assumptions.',gaps:[],cases:scenarioLabels.map((label,i)=>({label,weight:[15,25,30,20,10][i],metricPerShare:[22,34,48,65,90][i]/10,multiple:10,netCashPerShare:0,drivers:'Assumed operating outcome',assumptions:'Assumed earnings and multiple, not reported forecasts.',startingEvidence:'Reported operating results anchored the model.',evidenceDate:'2026-09-01',sources:[url]}))};}
it('reproduces the IONS chat arithmetic correction from representative inputs',()=>{const d=buildDistribution(model(),citations,'2026-10-08');const s=distributionSummary(d.cases,43.3)!;expect(s.price).toBeCloseTo(48.2);expect(s.returnPct).toBeCloseTo(11.3164);expect(s.gain).toBe(60);expect(s.largeLoss).toBe(40);expect(s.largeGain).toBe(30);expect(d.targetDate).toBe('2027-10-08');});
it('rejects missing and duplicate cases and weights that do not total 100',()=>{for(const mode of ['missing','duplicate','weight']){const p=model();if(mode==='missing')p.cases.pop();if(mode==='duplicate')p.cases[0].label='Base';if(mode==='weight')p.cases[0].weight=16;expect(buildDistribution(p,citations,'2026-10-08').cases).toHaveLength(0);}});
it('withholds unsupported links, stale/future/invalid dates and unordered prices',()=>{for(const mode of ['link','old','future','invalid','order']){const p=model();if(mode==='link')p.cases[0].sources=['https://invented.example'];if(mode==='old')p.cases[0].evidenceDate='2024-01-01';if(mode==='future')p.cases[0].evidenceDate='2027-01-01';if(mode==='invalid')p.cases[0].evidenceDate='2026-02-30';if(mode==='order')p.cases[0].metricPerShare=100;expect(buildDistribution(p,citations,'2026-10-08').cases).toHaveLength(0);}});
it('does not add cash/debt twice in an earnings model',()=>{const p=model();p.cases[0].netCashPerShare=3;expect(buildDistribution(p,citations,'2026-10-08').cases).toHaveLength(0);});
it('bridges enterprise sales to equity, floors at zero and distinguishes flat',()=>{const p=model();p.basis='Revenue per share × EV/sales';p.cases.forEach(c=>c.netCashPerShare=-22);const d=buildDistribution(p,citations,'2026-10-08');expect(d.cases[0].price).toBe(0);const s=distributionSummary([{price:0,weight:20},{price:10,weight:30},{price:100,weight:50}],10)!;expect(s.flat).toBe(30);expect(s.loss).toBe(20);expect(s.gain).toBe(50);});
it('rejects invalid user weights or prices instead of normalizing them',()=>{expect(distributionSummary([{price:10,weight:99}],10)).toBeNull();expect(distributionSummary([{price:-1,weight:100}],10)).toBeNull();expect(distributionSummary([{price:10,weight:100}],0)).toBeNull();});
it('handles archived reports without inventing a distribution',()=>{expect(buildDistribution(undefined,citations,'2026-10-08').cases).toHaveLength(0);});

import { marketChecks, MULTIPLE_LIMITS } from '../lib/scenario-distribution';
it('flags cases whose multiple is far above today\'s and says the price rests on a re-rating',()=>{
  const d=buildDistribution(model(),citations,'2026-10-08'); // every case assumes P/E 10
  expect(marketChecks(d,{price:43.3,currentMultiple:10})).toEqual([]);
  const w=marketChecks(d,{price:43.3,currentMultiple:5}); // today's P/E 5: base 10 is 2.0x > 1.5x
  expect(w.length).toBe(1); // only Base trips (2.0x > 1.5x); the others are inside their 2.5x limit
  expect(w[0]).toContain('Base case'); expect(w[0]).toContain('2.0× today');
  expect(marketChecks(d,{price:43.3,currentMultiple:3.5}).length).toBe(5); // 2.86x beats every limit
  expect(marketChecks(d,{price:43.3,currentMultiple:8}).length).toBe(0); // 1.25x base, within limits
});
it('uses a wider limit for non-base cases',()=>{
  const p=model(); p.cases[4].multiple=24; p.cases[4].metricPerShare=9; // severe bull P/E 24 vs today 10 = 2.4x < 2.5x
  const d=buildDistribution(p,citations,'2026-10-08');
  expect(marketChecks(d,{price:43.3,currentMultiple:10}).filter(x=>x.startsWith('Severe bull'))).toEqual([]);
  p.cases[4].multiple=26;
  expect(marketChecks(buildDistribution(p,citations,'2026-10-08'),{price:43.3,currentMultiple:10}).filter(x=>x.startsWith('Severe bull')).length).toBe(1);
});
it('warns when the weighted return runs far above the deterministic DCF, and only then',()=>{
  const d=buildDistribution(model(),citations,'2026-10-08'); // weighted return +11.3% at price 43.3
  expect(marketChecks(d,{price:43.3,currentMultiple:10,dcfUpsidePct:-40}).join(' ')).toMatch(/points above the deterministic DCF/);
  expect(marketChecks(d,{price:43.3,currentMultiple:10,dcfUpsidePct:-20})).toEqual([]);
  expect(MULTIPLE_LIMITS.dcfGapPoints).toBe(40);
});
it('says so when today\'s multiple cannot be computed instead of passing silently',()=>{
  const d=buildDistribution(model(),citations,'2026-10-08');
  expect(marketChecks(d,{price:43.3}).join(' ')).toMatch(/could not be computed/);
  expect(marketChecks(buildDistribution(undefined,citations,'2026-10-08'),{price:43.3})).toEqual([]);
});

import { z } from 'zod';
import type { Citation } from './types';
import { validDate } from './thesis-review';
import { scenarioLabels, distributionSummary } from './scenario-math';
export { scenarioLabels } from './scenario-math';
const fields = ['drivers', 'assumptions', 'startingEvidence', 'evidenceDate'];
const row = z.object({ label: z.enum(scenarioLabels), weight: z.number().finite().min(0).max(100),
  metricPerShare: z.number().finite().min(0), multiple: z.number().finite().min(0), netCashPerShare: z.number().finite(),
  drivers: z.string().max(800), assumptions: z.string().max(1200), startingEvidence: z.string().max(1000),
  evidenceDate: z.string(), sources: z.array(z.string()).max(5) });
export const distributionInputSchema = z.object({ basis: z.enum(['Earnings per share × P/E', 'Revenue per share × EV/sales', 'Unavailable']),
  weightReason: z.string().max(1000), gaps: z.array(z.string()).max(6), cases: z.array(row).max(5) });
export type DistributionInput = z.infer<typeof distributionInputSchema>;
export type Distribution = { targetDate: string; basis: DistributionInput['basis']; weightReason: string; gaps: string[];
  cases: (DistributionInput['cases'][number] & { price: number })[] };
export const distributionJsonSchema = { type: 'object', additionalProperties: false, required: ['basis','weightReason','gaps','cases'], properties: {
  basis: { type:'string', enum:['Earnings per share × P/E','Revenue per share × EV/sales','Unavailable'] }, weightReason: {type:'string'},
  gaps: {type:'array',maxItems:6,items:{type:'string'}}, cases: {type:'array',maxItems:5,items:{type:'object',additionalProperties:false,
    required:['label','weight','metricPerShare','multiple','netCashPerShare',...fields,'sources'], properties: {
      label: {type:'string',enum:[...scenarioLabels]}, weight:{type:'number'}, metricPerShare:{type:'number'},multiple:{type:'number'},netCashPerShare:{type:'number'},
      ...Object.fromEntries(fields.map(f=>[f,{type:'string'}])), sources:{type:'array',maxItems:5,items:{type:'string'}}
    } }} } };
/** Assumption model, never a validated probability forecast or a rating input. */
export function buildDistribution(input: unknown, citations: Citation[], analyzedAt: string): Distribution {
  const date = new Date(analyzedAt); date.setUTCFullYear(date.getUTCFullYear()+1);
  const empty: Distribution = {targetDate: Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : '', basis:'Unavailable',weightReason:'',gaps:[],cases:[]};
  const parsed = distributionInputSchema.safeParse(input);
  if(!parsed.success) return {...empty,gaps:['A supported five-case model has not been supplied. Older reports keep their original conclusions.']};
  const p=parsed.data;
  const fail=(gap:string):Distribution=>({...empty,gaps:[...p.gaps,gap]});
  if(p.basis==='Unavailable'||p.cases.length!==5) return fail('Five supported cases and a suitable earnings or enterprise-sales model are needed.');
  if(new Set(p.cases.map(c=>c.label)).size!==5) return fail('Each scenario must appear exactly once.');
  if(Math.abs(p.cases.reduce((s,c)=>s+c.weight,0)-100)>0.000001) return fail('Scenario weights must total 100%.');
  if(!p.weightReason.trim()) return fail('The assumed weights need an explanation.');
  const allowed = new Set(citations.map(c=>c.url).filter(url=>/^https?:\/\//.test(url)));
  const cases=p.cases.slice().sort((a,b)=>scenarioLabels.indexOf(a.label)-scenarioLabels.indexOf(b.label)).map(c=>({...c,
    sources:[...new Set(c.sources.filter(u=>allowed.has(u)))],
    price: Math.max(0,c.metricPerShare*c.multiple+(p.basis==='Revenue per share × EV/sales'?c.netCashPerShare:0))}));
  for(let i=0;i<cases.length;i++) {
    const c=cases[i]; const age=(Date.parse(analyzedAt)-Date.parse(c.evidenceDate))/86400000;
    if(!c.sources.length||!validDate(c.evidenceDate)||!Number.isFinite(age)||age<0||age>460||!c.startingEvidence.trim()||!c.drivers.trim()||!c.assumptions.trim()) return fail('Each case needs dated starting evidence from this report, drivers and explicit forecast assumptions.');
    if(p.basis==='Earnings per share × P/E'&&c.netCashPerShare!==0) return fail('An earnings-equity model must not add cash or subtract debt again.');
    if(!Number.isFinite(c.price)|| (i>0&&c.price<cases[i-1].price)) return fail('Scenario prices must be finite and ordered from severe bear to severe bull.');
  }
  return {targetDate:empty.targetDate,basis:p.basis,weightReason:p.weightReason,gaps:p.gaps,cases};
}
export { distributionSummary } from "./scenario-math";

/** How far a case may assume the market multiple moves before the report says so. */
export const MULTIPLE_LIMITS = { base: 1.5, other: 2.5, dcfGapPoints: 40 };
/**
 * Compares the model-supplied five-case assumptions with today's multiple and the deterministic DCF.
 * It never changes the model's numbers; it returns plain-language warnings for `gaps` so a reader
 * sees when the weighted return rests on a re-rating or disagrees sharply with the DCF.
 */
export function marketChecks(d: Distribution, ctx: { price: number; currentMultiple?: number; dcfUpsidePct?: number }): string[] {
  const out: string[] = [];
  if (d.cases.length !== 5) return out;
  const unit = d.basis === 'Earnings per share × P/E' ? 'P/E' : 'EV/sales';
  const cur = ctx.currentMultiple;
  if (cur != null && Number.isFinite(cur) && cur > 0) {
    for (const c of d.cases) {
      const limit = c.label === 'Base' ? MULTIPLE_LIMITS.base : MULTIPLE_LIMITS.other;
      if (c.multiple > cur * limit) out.push(`${c.label} case assumes a ${unit} of ${c.multiple.toFixed(1)}, ${(c.multiple / cur).toFixed(1)}× today's ${cur.toFixed(1)}; its price rests on a re-rating, not on earnings growth alone.`);
    }
  } else out.push(`Today's ${unit} could not be computed, so the case multiples are not checked against the current market multiple.`);
  const s = distributionSummary(d.cases, ctx.price);
  if (s && ctx.dcfUpsidePct != null && Number.isFinite(ctx.dcfUpsidePct) && s.returnPct - ctx.dcfUpsidePct > MULTIPLE_LIMITS.dcfGapPoints)
    out.push(`The weighted five-case return (${s.returnPct.toFixed(0)}%) is ${(s.returnPct - ctx.dcfUpsidePct).toFixed(0)} points above the deterministic DCF upside (${ctx.dcfUpsidePct.toFixed(0)}%). Treat the five-case view as an optimistic assumption set, not a second valuation.`);
  return out;
}

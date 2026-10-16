import { afterEach, expect, it, vi } from 'vitest';
import { researchGaps } from '../lib/server/web-research';
import type { ResearchRun } from '../lib/types';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses a smaller cited search pass focused on the valuation blocker', async()=>{
  vi.stubEnv('OPENAI_API_KEY','test-only');
  const fetch = vi.fn(async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Dated company evidence.',annotations:[{type:'url_citation',start_index:0,end_index:5,title:'Company filing',url:'https://www.sec.gov/filing'}]}]}]})}));
  vi.stubGlobal('fetch',fetch);
  const gaps = ['Cash generation forecast is missing.'];
  const result = await researchGaps({ticker:'TEST',companyName:'Synthetic',analyzedAt:'2026-10-07',risks:[],notes:[]} as unknown as ResearchRun,true,gaps);
  const body = JSON.parse((fetch.mock.calls[0] as unknown as [string,{body:string}])[1].body);
  expect(body.max_tool_calls).toBe(3);
  expect(JSON.parse(body.input[1].content).targetedGaps).toEqual(gaps);
  expect(JSON.parse(body.input[1].content).followUpPolicy).toContain('only automatic follow-up');
  expect(result.citations[0].url).toBe('https://www.sec.gov/filing');
});

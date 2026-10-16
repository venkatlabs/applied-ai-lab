import { afterEach, expect, it, vi } from 'vitest';
import { SecProvider, latestInstantFact } from '../lib/providers/sec';
afterEach(()=>vi.unstubAllGlobals());
it('reads USD balance facts from foreign annual filings and ignores duration or non-USD facts',()=>{
  const fact={units:{USD:[{form:'20-F',end:'2025-12-31',filed:'2026-04-01',val:100},{form:'6-K',end:'2026-06-30',filed:'2026-08-01',val:120},{form:'20-F',start:'2025-01-01',end:'2025-12-31',filed:'2026-04-01',val:999}],EUR:[{form:'20-F',end:'2025-12-31',filed:'2026-04-01',val:999}]}};
  expect(latestInstantFact(fact)?.val).toBe(120);
  expect(latestInstantFact({units:{EUR:fact.units.EUR}})).toBeUndefined();
});
it('makes reported 20-F cash and debt available to valuation without inventing missing debt',async()=>{
  const instant=(val:number)=>({units:{USD:[{val,form:'20-F',end:'2025-12-31',filed:'2026-04-01'}]}});
  const annual=(val:number)=>({units:{USD:[{val,form:'20-F',start:'2025-01-01',end:'2025-12-31',filed:'2026-04-01'}]}});
  const gaap={CashAndCashEquivalentsAtCarryingValue:instant(100),LongTermDebt:instant(40),RevenueFromContractWithCustomerExcludingAssessedTax:annual(500),NetCashProvidedByUsedInOperatingActivities:annual(50),PaymentsToAcquirePropertyPlantAndEquipment:annual(10)};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes('company_tickers')?{'0':{ticker:'TEST',cik_str:1,title:'Synthetic foreign filer'}}:url.includes('companyfacts')?{entityName:'Synthetic',facts:{'us-gaap':gaap}}:{filings:{recent:{form:[]}}}})));
  const first=await new SecProvider().getFundamentals('TEST');
  expect(first.cash).toBe(100); expect(first.debt).toBe(40); expect(first.freeCashFlow).toBe(40);
  delete (gaap as Partial<typeof gaap>).LongTermDebt;
  expect((await new SecProvider().getFundamentals('TEST')).debt).toBeUndefined();
});

import {AsyncLocalStorage} from 'node:async_hooks';
import type {UsageAttempt,ReportCost} from '../cost-types';
const context=new AsyncLocalStorage<UsageAttempt[]>();
export async function withCosts<T>(work:()=>Promise<T>):Promise<{value:T;cost:ReportCost}>{
 const attempts:UsageAttempt[]=[];
 return context.run(attempts,async()=>{const started=Date.now();const value=await work();const complete=attempts.length>0&&attempts.every(a=>a.estimatedUSD!==undefined);return {value,cost:{durationMs:Date.now()-started,attempts,complete,estimatedUSD:complete?attempts.reduce((v,a)=>v+a.estimatedUSD!,0):null,note:'Recorded model usage for this generation only. Cached company evidence may have been generated earlier. Provider subscriptions and optional follow-up research are excluded. Dollar totals require configured, dated prices for every attempt; missing usage is never treated as zero.'}};});
}
export function startUsage(purpose:string,model:string){const attempt:UsageAttempt={purpose,model,status:'started'};context.getStore()?.push(attempt);return attempt;}
export function recordUsage(a:UsageAttempt,payload:any){
 const u=payload?.usage;a.model=payload?.model||a.model;
 if(!u||![u.input_tokens,u.output_tokens].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0)){a.status='unknown';return;}
 a.status='recorded';a.inputTokens=u.input_tokens;a.outputTokens=u.output_tokens;a.cachedTokens=u.input_tokens_details?.cached_tokens;
 a.searchCalls=(payload.output??[]).filter((x:any)=>x.type==='web_search_call').length;
 // Pricing is a deployment setting, never inferred from a model name. Reasoning tokens
 // are already included in output_tokens; searches are counted only once.
 try{const p=JSON.parse(process.env.RESEARCH_PRICING_JSON||'{}')[a.model];
 if(!p||!/^\d{4}-\d{2}-\d{2}$/.test(p.asOf)||![p.inputPerMillion,p.cachedPerMillion,p.outputPerMillion,p.searchPerCall].every((x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||a.cachedTokens===undefined)return;
 if((u.input_tokens_details?.cache_write_tokens??0)>0)return; // requires a separate verified write price
 if(a.cachedTokens<0||a.cachedTokens>u.input_tokens)return;
 a.estimatedUSD=((u.input_tokens-a.cachedTokens)*p.inputPerMillion+a.cachedTokens*p.cachedPerMillion+u.output_tokens*p.outputPerMillion)/1e6+a.searchCalls!*p.searchPerCall;a.pricingDate=p.asOf;
 }catch{/* Preserve usage even when pricing is unavailable. */}
}

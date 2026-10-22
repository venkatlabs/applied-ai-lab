export type UsageAttempt={purpose:string;model:string;status:'started'|'recorded'|'unknown';inputTokens?:number;cachedTokens?:number;outputTokens?:number;searchCalls?:number;estimatedUSD?:number;pricingDate?:string};
export type ReportCost={attempts:UsageAttempt[];estimatedUSD:number|null;complete:boolean;note:string;durationMs?:number};

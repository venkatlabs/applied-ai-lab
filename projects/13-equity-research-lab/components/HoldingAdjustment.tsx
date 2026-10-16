'use client';
import { PrivatePortfolio } from './PortfolioPrivacy';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {adjustHolding,readHoldings,dollars,percent,type Holdings} from '@/lib/holdings';
import {usePortfolioSession} from './PortfolioSession';
import {connectedHoldings} from '@/lib/connected-portfolio';
function HoldingAdjustmentContent({ticker}:{ticker:string}){
 const {snapshot}=usePortfolioSession();
 const [s,S]=useState<Holdings|null>(null),[loadError,E]=useState(''),[mode,M]=useState('hold'),[amount,A]=useState(10000),[funding,F]=useState<'cash'|'external'>('cash'),[limit,L]=useState(10);
 useEffect(()=>{try{S(snapshot?connectedHoldings(snapshot).holdings:readHoldings());}catch{E('Connected or saved holdings could not be read. Refresh or import a valid snapshot.');}},[snapshot]);
 const p=s?.positions.find(p=>p.symbol===ticker);
 let result:ReturnType<typeof adjustHolding>|undefined,error='';
 if(s&&p)try{if(amount<0)throw new Error('Enter a positive amount.');result=adjustHolding(s,ticker,mode==='hold'?0:mode==='trim'?-amount:amount,funding);}catch(e){error=e instanceof Error?e.message:'Invalid adjustment';}
 const stale=s&&(Date.now()-Date.parse(s.asOf))/86400000>7;
 return <section className="panel"><p className="eyebrow">PRIVATE PORTFOLIO CONTEXT</p><h2>How would I readjust {ticker}?</h2>
 {!s||!p?<p>{loadError||`Ownership of ${ticker} is unknown in this browser.`} <Link href="/">Open your portfolio</Link>, including zero shares if you own none, to calculate the effect of an add or trim.</p>:<>
 <p>{s.scope} · {s.asOf} · {s.coverage==='partial'?'Selected holdings; other exposure is unknown.':'All holdings within the stated scope.'} Total {dollars(s.totalValue)}. {stale?'This snapshot is over seven days old. Update it before acting.':'Check the snapshot against your account before acting.'}</p>
 <div className="input-grid"><label>Compare<select value={mode} onChange={e=>M(e.target.value)}><option value="hold">Hold</option><option value="add">Add</option><option value="trim">Trim</option></select></label>{mode!=='hold'&&<label>Amount ($)<input type="number" min="0" value={amount} onChange={e=>A(Number(e.target.value))}/></label>}{mode==='add'&&<label>Fund the add with<select value={funding} onChange={e=>F(e.target.value as 'cash'|'external')}><option value="cash">Existing available cash</option><option value="external">New money from outside this scope</option></select></label>}<label>Your position limit (%)<input type="number" min="1" max="100" value={limit} onChange={e=>L(Number(e.target.value))}/></label></div>
 {error&&<p role="alert">{error}</p>}{result&&<><div className="table-wrap"><table><thead><tr><th></th><th>Now</th><th>After comparison</th></tr></thead><tbody><tr><td>Position value</td><td>{dollars(result.before)}</td><td>{dollars(result.after)}</td></tr><tr><td>Shares</td><td>{result.sharesBefore.toFixed(4)}</td><td>{result.sharesAfter.toFixed(4)}</td></tr><tr><td>Weight in this scope</td><td>{percent(result.weightBefore)}</td><td>{percent(result.weightAfter)}</td></tr></tbody></table></div>
 <p><strong>Portfolio guidance:</strong> {limit<1||limit>100?'Enter a limit from 1% to 100%.':result.weightAfter>limit/100?'This would exceed your chosen position limit. Compare a smaller add or a trim before increasing exposure.':'This stays within your chosen position limit. That alone does not establish a reason to buy or sell.'}</p>
 <p className="muted">The default 10% limit is an editable planning assumption. Company quality and price attractiveness are assessed above. {p.kind==='fund'?'This is a fund: its underlying company and sector exposure may overlap other holdings.':'Other stocks and funds may add exposure to the same companies or sector.'} Fund look-through is not calculated.</p><p className="muted">Uses the snapshot price of ${p.price.toFixed(2)} throughout, not the report price. Trim proceeds remain as cash in this scope. Taxes, fees and price movement are excluded; use <Link href={`/compare?symbol=${encodeURIComponent(p.symbol)}`}>holding diversification</Link> for illustrative trim-ratio comparisons. Fractional shares are mathematical estimates.</p></>}
 </>}</section>;
}

export function HoldingAdjustment(props: Parameters<typeof HoldingAdjustmentContent>[0]) { return <PrivatePortfolio><HoldingAdjustmentContent {...props} /></PrivatePortfolio>; }

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RunResearch } from "./RunResearch";
import { completionState } from "@/lib/research-completion";
import { loadArchive, changeLocalVisibility } from "@/lib/archive";
import { investmentDecision } from "@/lib/decision";
import type { ResearchRun } from "@/lib/types";
export default function ResearchArchive() {
  const [runs,setRuns]=useState<ResearchRun[]>([]),[message,setMessage]=useState("Loading archive…"),[trash,setTrash]=useState(false),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string[]>([]);
  async function refresh(view: boolean){const result=await loadArchive(view);setRuns(result.runs);setMessage(result.message);}
  useEffect(()=>{let active=true;setMessage("Loading archive…");setSelected([]);loadArchive(trash).then(result=>{if(active){setRuns(result.runs);setMessage(result.message);}});return()=>{active=false;};},[trash]);
  async function change(ids: string[]) {
    setBusy(true); const chosen=runs.filter(r=>ids.includes(r.id));
    try {
      const cloud=chosen.filter(r=>r.storage==="cloud");let changed: string[]=[];
      if(cloud.length){const response=await fetch("/api/research",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:cloud.map(r=>r.id),action:trash?"restore":"remove"}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not change the archive.");changed=data.ids;}
      const succeeded=chosen.filter(r=>r.storage!=="cloud"||changed.includes(r.id));
      let localWarning="", localFailed=false;try {changeLocalVisibility(succeeded,trash);}catch{localFailed=true;localWarning=" Browser storage could not be updated. Only successful cloud changes were saved.";}
      setSelected([]);await refresh(trash);setMessage(`${localFailed ? changed.length : succeeded.length} report(s) ${trash?"restored":"moved to Trash"}.${localWarning}${succeeded.length<chosen.length?" Some selected cloud records were unavailable; refresh and retry.":""}`);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not change the archive.");}finally{setBusy(false);}
  }
  return <section><p className="eyebrow">SAVED SNAPSHOTS</p><h1>{trash?"Archive trash":"Research archive"}</h1><p className="lede">Open saved reports or complete missing evidence. Earlier reports remain unchanged as history. Cloud history is private to this browser’s workspace; keep this site’s cookies to retain access. Reports moved to Trash can be restored.</p>
    <div className="toolbar"><button className="action secondary" disabled={busy} onClick={()=>setTrash(!trash)}>{trash?"Back to archive":"View Trash"}</button><button className="action" disabled={busy||!selected.length} onClick={()=>change(selected)}>{busy?"Saving…":`${trash?"Restore":"Remove"} selected (${selected.length})`}</button></div>
    <p role="status">{message}</p>{message==="Loading archive…"?null:runs.length===0?<div className="panel">{trash?"Trash is empty.":"No saved reports yet."}</div>:<div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all displayed reports" disabled={busy} checked={runs.length>0&&selected.length===runs.length} onChange={e=>setSelected(e.target.checked?runs.map(r=>r.id):[])}/></th><th>Date</th><th>Ticker</th><th>Saved in</th><th>Decision</th><th>Investment score</th><th>Action</th></tr></thead><tbody>{runs.map(r=><tr key={r.id} className={selected.includes(r.id)?"selected-row":""}><td><input type="checkbox" aria-label={`Select ${r.ticker} report ${r.analyzedAt}`} disabled={busy} checked={selected.includes(r.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,r.id]:old.filter(id=>id!==r.id))}/></td><td>{new Date(r.analyzedAt).toLocaleString()}</td><td>{trash?r.ticker:<Link prefetch={false} href={`/research/${encodeURIComponent(r.id)}`}>{r.ticker}</Link>}</td><td>{r.storage==="cloud"?"Cloud":"Browser"}</td><td>{investmentDecision(r).action}{!trash && completionState(r).followUp && <RunResearch ticker={r.ticker} complete reportId={r.id} compact />}{r.researchCompletion?.attempted && <p className="muted">{r.researchCompletion.status === "evidence blocked" ? "Follow-up completed; evidence still missing." : "Research complete."}</p>}</td><td>{investmentDecision(r).score ?? "Not rated"}</td><td><button className="action secondary" disabled={busy} onClick={()=>change([r.id])}>{trash?"Restore":"Remove"}</button></td></tr>)}</tbody></table></div>}
  </section>;
}

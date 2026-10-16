'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { DecisionJournal } from './DecisionJournal';
import { ResearchCalls } from './ResearchCalls';
const Performance = dynamic(() => import('./ResearchPerformance'), { loading: () => <p>Loading research outcomes…</p> });
const views = ['Research calls', 'My decisions', 'Prediction scorecard'] as const;
export function ActivityWorkspace() {
  const [view, setView] = useState<typeof views[number]>('Research calls');
  const [focus, setFocus] = useState('');
  const content = useMemo(() => view === 'My decisions' ? <DecisionJournal focusSymbol={focus} /> : view === 'Research calls' ? <ResearchCalls onLog={s => { setFocus(s); setView('My decisions'); }} /> : <Performance />, [view, focus]);
  return <><section className="hero compact"><div><p className="eyebrow">JOURNAL</p><h1>What was said, what you did, what happened.</h1><p className="lede">Research calls are recorded automatically. Add what you did to see whether the process works.</p></div></section><div className="toolbar activity-tabs" role="tablist" aria-label="Journal views">{views.map(name => <button className="action secondary" role="tab" aria-selected={view === name} aria-controls="activity-content" id={`activity-${views.indexOf(name)}`} key={name} onClick={() => setView(name)}>{name}</button>)}</div><div id="activity-content" role="tabpanel" aria-labelledby={`activity-${views.indexOf(view)}`}>{content}</div></>;
}

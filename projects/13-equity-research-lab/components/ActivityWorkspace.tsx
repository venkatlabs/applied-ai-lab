'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { DecisionJournal } from './DecisionJournal';
const Archive = dynamic(() => import('./ResearchArchive'), { loading: () => <p>Loading saved research…</p> });
const Performance = dynamic(() => import('./ResearchPerformance'), { loading: () => <p>Loading research outcomes…</p> });
const views = ['Saved research', 'Research outcomes', 'Decision journal (optional)'] as const;
export function ActivityWorkspace() {
  const [view, setView] = useState<typeof views[number]>('Saved research');
  return <><section className="hero compact"><div><p className="eyebrow">ACTIVITY</p><h1>Your saved research.</h1><p className="lede">Revisit saved work and learn from previous decisions.</p></div></section><div className="toolbar activity-tabs" role="tablist" aria-label="Activity views">{views.map(name => <button className="action secondary" role="tab" aria-selected={view === name} aria-controls="activity-content" id={`activity-${views.indexOf(name)}`} key={name} onClick={() => setView(name)}>{name}</button>)}</div><div id="activity-content" role="tabpanel" aria-labelledby={`activity-${views.indexOf(view)}`}>{view === 'Decision journal (optional)' ? <DecisionJournal /> : view === 'Saved research' ? <Archive /> : <Performance />}</div></>;
}

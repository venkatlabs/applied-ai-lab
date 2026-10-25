'use client';
import { useRef, useState } from 'react';
import { saveRun } from '@/lib/archive';
import type { ResearchRun } from '@/lib/types';

/** Sequential, confirmed, budget-aware research of a few stocks. Stops on the first error. */
export function useResearchRunner(onReport: (run: ResearchRun) => void, onFinished?: () => void) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const stop = useRef(false);
  async function run(tickers: string[], remaining: number, why?: string) {
    if (!tickers.length || busy) return;
    if (!window.confirm(`Research ${tickers.length} stock${tickers.length === 1 ? '' : 's'} (${tickers.join(', ')})${why ? ` — ${why}` : ''}?\n\nEach uses one paid report from today's budget (${remaining} left). It stops if the budget runs out or an error occurs.`)) return;
    setBusy(true); stop.current = false; setMessage('');
    let done = 0;
    for (const ticker of tickers) {
      if (stop.current) break;
      setProgress(`Researching ${ticker} (${done + 1} of ${tickers.length})… this takes a few minutes.`);
      try {
        const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Research could not complete.');
        saveRun(body as ResearchRun); onReport(body as ResearchRun); done++;
      } catch (error) { setMessage(`${ticker}: ${error instanceof Error ? error.message : 'Research could not complete.'} Stopped after ${done} report${done === 1 ? '' : 's'}.`); break; }
    }
    setProgress(''); setBusy(false);
    if (done === tickers.length) setMessage(`Done. ${done} stock${done === 1 ? '' : 's'} researched.`);
    onFinished?.();
  }
  return { run, busy, progress, message, stop: () => { stop.current = true; } };
}

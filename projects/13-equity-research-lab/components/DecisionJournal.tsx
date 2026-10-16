'use client';
import { PrivatePortfolio } from './PortfolioPrivacy';
import { useEffect, useState } from 'react';
import { addJournal, gradeEntry, loadJournal, removeJournal, type JournalEntry } from '@/lib/journal';
import { loadChecks } from '@/lib/watchlist';
import type { QuickCheck } from '@/lib/quick-check';

function DecisionJournalContent({ suggestions = {} }: { suggestions?: Record<string, string> }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [checks, setChecks] = useState<Record<string, QuickCheck>>({});
  const [f, setF] = useState({ symbol: '', action: 'Bought' as JournalEntry['action'], price: '', amount: '', reason: '' });
  const [error, setError] = useState('');
  useEffect(() => { setEntries(loadJournal()); setChecks(loadChecks()); }, []);
  function add() {
    const symbol = f.symbol.trim().toUpperCase();
    if (!/^[A-Z.\-]{1,10}$/.test(symbol) || !(Number(f.price) > 0) || !f.reason.trim()) { setError('Enter a symbol, the price you acted at and a one-line reason.'); return; }
    setError('');
    setEntries(addJournal({ date: new Date().toISOString().slice(0, 10), symbol, action: f.action, price: Number(f.price), amount: Number(f.amount) || undefined, reason: f.reason.trim().slice(0, 300), toolSaid: suggestions[symbol] }));
    setF({ ...f, symbol: '', price: '', amount: '', reason: '' });
  }
  const graded = entries.map(e => ({ e, g: gradeEntry(e, checks[e.symbol] ? { price: checks[e.symbol].price, date: checks[e.symbol].checkedAt } : undefined) }));
  const directional = graded.filter(x => x.g?.right != null);
  return <section className="panel">
    <p className="eyebrow">DECISION JOURNAL</p><h2>What did you actually do?</h2>
    <p>Record real decisions with a one-line reason. Each is graded later against the latest quick-check price, so you learn whether your process (and the tool&apos;s) works. Stored only in this browser.</p>
    <div className="input-grid">
      <label>Symbol<input value={f.symbol} onChange={e => setF({ ...f, symbol: e.target.value.toUpperCase() })} /></label>
      <label>Action<select value={f.action} onChange={e => setF({ ...f, action: e.target.value as JournalEntry['action'] })}><option>Bought</option><option>Sold</option><option>Held</option><option>Skipped</option></select></label>
      <label>Price ($)<input type="number" min="0" step="any" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
      <label>Amount ($, optional)<input type="number" min="0" step="any" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
      <label>Why (one line)<input value={f.reason} maxLength={300} onChange={e => setF({ ...f, reason: e.target.value })} /></label>
    </div>
    <button onClick={add}>Record decision</button>{error && <p role="alert">{error}</p>}
    {entries.length > 0 && <>
      <p>{directional.length ? `${directional.filter(x => x.g!.right).length} of ${directional.length} buy/sell decisions have moved your way so far (price only, no benchmark).` : 'Buy/sell decisions are graded once a later quick check exists.'}</p>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Decision</th><th>Tool said</th><th>Why</th><th>Since then</th><th></th></tr></thead>
        <tbody>{graded.map(({ e, g }) => <tr key={e.id}><td>{e.date}</td><td>{e.action} {e.symbol} @ ${e.price.toFixed(2)}{e.amount ? ` · $${e.amount.toLocaleString('en-US')}` : ''}</td><td>{e.toolSaid ?? '—'}</td><td><small>{e.reason}</small></td><td>{g ? `${g.movePct > 0 ? '+' : ''}${g.movePct}% in ${g.days}d${g.right == null ? '' : g.right ? ' ✓' : ' ✗'}` : 'Not yet'}</td><td><button aria-label="Delete entry" onClick={() => setEntries(removeJournal(e.id))}>✕</button></td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

export function DecisionJournal(props: Parameters<typeof DecisionJournalContent>[0] = {}) { return <PrivatePortfolio><DecisionJournalContent {...props} /></PrivatePortfolio>; }

'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Trigger, TriggerMetric } from '@/lib/triggers';

const statusLabel = { armed: 'Armed', watch: 'On watch', tripped: 'Tripped' } as const;

/** Pre-committed kill and upgrade triggers for one stock. Loosening a kill trigger is logged as a goalpost move. */
export function StockTriggers({ ticker }: { ticker: string }) {
  const [triggers, setTriggers] = useState<Trigger[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: 'kill' as 'kill' | 'upgrade', text: '', metric: 'manual' as TriggerMetric, threshold: '', due: '' });

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/triggers?symbol=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Triggers are unavailable.');
      setTriggers((await response.json()).triggers);
    } catch (e) { setTriggers([]); setMessage(e instanceof Error ? e.message : 'Triggers are unavailable.'); }
  }, [ticker]);
  useEffect(() => { void load(); }, [load]);

  async function call(method: string, body: object, retryWithReason?: (reason: string) => object) {
    setBusy(true); setMessage('');
    try {
      let response = await fetch('/api/triggers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = await response.json();
      if (response.status === 409 && data.code === 'goalpost-reason-required' && retryWithReason) {
        const reason = window.prompt(`${data.error}\n\nReason:`);
        if (!reason) { setMessage('Change not saved: a reason is required to loosen a kill trigger.'); return; }
        response = await fetch('/api/triggers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryWithReason(reason)) });
        data = await response.json();
      }
      if (!response.ok) throw new Error(data.error ?? 'Could not save.');
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    await call('POST', { symbol: ticker, kind: form.kind, text: form.text, metric: form.metric, threshold: form.metric === 'manual' ? null : Number(form.threshold), due: form.due || null });
    setForm({ ...form, text: '', threshold: '', due: '' });
  }
  const edit = (t: Trigger, patch: object) => call('PATCH', { id: t.id, ...patch }, reason => ({ id: t.id, ...patch, reason }));

  return <section className="panel triggers" aria-labelledby="triggers-heading">
    <p className="eyebrow">PRE-COMMITTED TRIGGERS</p><h2 id="triggers-heading">When would you change your mind about {ticker}?</h2>
    <p className="muted">Kill triggers say when to give up on the thesis; upgrade triggers say what would justify a full re-review. Price triggers update automatically each trading day; dated ones ask you to check the evidence. Nothing here trades, and a tripped upgrade trigger never changes the verdict by itself. Loosening a kill trigger is logged as a goalpost move.</p>
    {triggers === null ? <p role="status">Loading…</p> : triggers.length === 0 ? <p>No triggers yet.</p> :
      <ul className="trigger-list">{triggers.map(t => <li key={t.id} className={`trigger ${t.status}`}>
        <div><span className={`tag trig-${t.kind}`}>{t.kind === 'kill' ? 'Kill' : 'Upgrade'}</span> <span className={`tag status-${t.status}`}>{statusLabel[t.status]}</span> {t.text}
          <p className="muted">{t.metric === 'manual' ? 'Judged by you' : `${t.metric === 'price_below' ? 'Price below' : 'Price above'} $${t.threshold}`}{t.due ? ` · test date ${t.due}` : ''}{t.evidence ? ` · ${t.evidence}` : ''}</p></div>
        <div className="button-row">
          {t.metric !== 'manual' && <button className="action secondary" disabled={busy} onClick={() => { const v = window.prompt('New price threshold', String(t.threshold)); if (v && Number(v) > 0) void edit(t, { threshold: Number(v) }); }}>Change price</button>}
          <button className="action secondary" disabled={busy} onClick={() => { const v = window.prompt('New test date (YYYY-MM-DD), blank to remove', t.due ?? ''); if (v !== null) void edit(t, { due: v.trim() || null }); }}>Change date</button>
          {t.status === 'tripped' && <button className="action secondary" disabled={busy} onClick={() => void edit(t, { status: 'armed' })}>Clear</button>}
          {t.status !== 'tripped' && t.metric === 'manual' && <button className="action secondary" disabled={busy} onClick={() => void edit(t, { status: 'tripped' })}>Mark tripped</button>}
          <button className="action secondary" disabled={busy} onClick={() => { if (window.confirm('Remove this trigger?')) void call('DELETE', { id: t.id }, reason => ({ id: t.id, reason })); }}>Remove</button>
        </div></li>)}</ul>}
    <div className="button-row"><button className="action" disabled={busy} onClick={() => void call('POST', { action: 'seed', symbol: ticker })}>Start from this report</button></div>
    <form className="input-grid" onSubmit={e => void add(e)}>
      <label>Type<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as 'kill' | 'upgrade' })}><option value="kill">Kill (give up)</option><option value="upgrade">Upgrade (re-review)</option></select></label>
      <label>Condition<input value={form.text} maxLength={300} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="e.g. Revenue falls two quarters in a row" /></label>
      <label>Measured by<select value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value as TriggerMetric })}><option value="manual">I will judge it</option><option value="price_below">Price falls below</option><option value="price_above">Price rises above</option></select></label>
      {form.metric !== 'manual' && <label>Price ($)<input type="number" min="0" step="any" value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} /></label>}
      <label>Test date (optional)<input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} /></label>
      <button type="submit" disabled={busy || form.text.trim().length < 3}>Add trigger</button>
    </form>
    <p role="status">{message}</p>
  </section>;
}

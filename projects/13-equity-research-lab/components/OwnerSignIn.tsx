'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortfolioSession } from './PortfolioSession';

export function OwnerSignIn({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/owner-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }), cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Sign-in failed.');
      setKey('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally { setBusy(false); }
  }

  if (!configured) return <section className="panel">
    <h2>Owner sign-in is not set up</h2>
    <p>Connected-account refresh stays off until <code>OWNER_ACCESS_KEY</code> (at least 32 characters) is added as a server-only environment variable on this deployment.</p>
  </section>;

  return <section className="panel">
    <h2>Owner sign-in</h2>
    <p>Connected accounts show private brokerage data, so they need the owner access key. The session lasts 12 hours on this browser.</p>
    <form className="ticker-search" onSubmit={submit}>
      <input aria-label="Owner access key" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Owner access key" />
      <button type="submit" disabled={busy || !key}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p role="status">{message}</p>
  </section>;
}

export function OwnerSignOut() {
  const router = useRouter();
  const { clearSnapshot } = usePortfolioSession();
  async function signOut() {
    // Drop the in-tab brokerage snapshot first: router.refresh() keeps client context,
    // so /holdings, /portfolio and /amzn would otherwise still see it.
    clearSnapshot();
    try { await fetch('/api/owner-session', { method: 'DELETE', cache: 'no-store' }); }
    finally { router.refresh(); }
  }
  return <button className="secondary" onClick={() => void signOut()}>Sign out</button>;
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function MainNavigation({ email }: { email?: string }) {
  const path = usePathname();
  const activity = ['/activity', '/research', '/performance', '/backtest', '/analysts'].some(p => path === p || path.startsWith(p + '/'));
  const settings = path === '/accounts';
  return <header className="nav"><Link href="/" className="brand">Equity Research Lab</Link><nav aria-label="Main navigation"><Link href="/" aria-current={!activity && !settings ? 'page' : undefined}>Portfolio</Link><Link href="/activity" aria-current={activity ? 'page' : undefined}>Activity</Link><Link href="/accounts" className="settings-link" aria-current={settings ? 'page' : undefined}>Account settings</Link>{email && <button type="button" className="signout" title={`Signed in as ${email}`} onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.assign('/signin'); }}>Sign out</button>}</nav></header>;
}

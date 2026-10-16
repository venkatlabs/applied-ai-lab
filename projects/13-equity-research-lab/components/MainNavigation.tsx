'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function MainNavigation({ email }: { email?: string }) {
  const path = usePathname();
  const is = (...bases: string[]) => bases.some(p => p === '/' ? path === '/' : path === p || path.startsWith(p + '/'));
  const items = [
    { href: '/', label: 'My stocks', on: path === '/' || is('/company', '/holdings', '/compare', '/portfolio', '/amzn') },
    { href: '/research', label: 'Research', on: is('/research', '/performance', '/backtest', '/analysts') },
    { href: '/opportunities', label: 'Discover', on: is('/opportunities', '/watchlist') },
    { href: '/activity', label: 'Journal', on: is('/activity') },
  ];
  const settings = path === '/accounts';
  return <header className="nav"><Link href="/" className="brand">Equity Research Lab</Link><nav aria-label="Main navigation">{items.map(i => <Link key={i.href} href={i.href} aria-current={i.on ? 'page' : undefined}>{i.label}</Link>)}<Link href="/accounts" className="settings-link" aria-current={settings ? 'page' : undefined}>Settings</Link>{email && <button type="button" className="signout" title={`Signed in as ${email}`} onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.assign('/signin'); }}>Sign out</button>}</nav></header>;
}

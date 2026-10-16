'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PORTFOLIO_REVEAL_TTL_MS, schedulePrivacyExpiry } from '@/lib/portfolio-privacy';

type Privacy = { visible: boolean; reveal: () => void; hide: () => void };
const PrivacyContext = createContext<Privacy | null>(null);

export function PortfolioPrivacyProvider({ children }: { children: ReactNode }) {
  // Reveal permission is deliberately not persisted to browser storage.
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return;
    const hide = () => setDeadline(null);
    const cancel = schedulePrivacyExpiry(deadline, hide);
    const checkOnReturn = () => { if (Date.now() >= deadline) hide(); };
    window.addEventListener('focus', checkOnReturn);
    window.addEventListener('pageshow', checkOnReturn);
    document.addEventListener('visibilitychange', checkOnReturn);
    return () => {
      cancel();
      window.removeEventListener('focus', checkOnReturn);
      window.removeEventListener('pageshow', checkOnReturn);
      document.removeEventListener('visibilitychange', checkOnReturn);
    };
  }, [deadline]);
  const privacy = useMemo(() => ({
    visible: deadline !== null && Date.now() < deadline,
    reveal: () => setDeadline(Date.now() + PORTFOLIO_REVEAL_TTL_MS),
    hide: () => setDeadline(null),
  }), [deadline]);
  return <PrivacyContext.Provider value={privacy}>{children}</PrivacyContext.Provider>;
}

export function usePortfolioPrivacy() {
  const privacy = useContext(PrivacyContext);
  if (!privacy) throw new Error('Portfolio privacy provider is missing.');
  return privacy;
}

export function PrivacyControl() {
  const { visible, reveal, hide } = usePortfolioPrivacy();
  return <div className="privacy-toolbar"><p role="status">{visible ? 'Portfolio numbers visible for 10 minutes.' : 'Portfolio numbers hidden.'}</p><button className="action secondary" aria-pressed={visible} onClick={visible ? hide : reveal}>{visible ? 'Hide numbers' : 'Show numbers'}</button></div>;
}

/** Keep form/result state mounted, but remove hidden details from display and access. */
export function PrivatePortfolio({ children, placeholder }: { children: ReactNode; placeholder?: ReactNode }) {
  const { visible } = usePortfolioPrivacy();
  return <>{!visible && (placeholder ?? <section className="panel privacy-placeholder"><h2>Portfolio numbers are hidden</h2><p>Choose Show numbers to view or edit these details for 10 minutes.</p></section>)}<div hidden={!visible} inert={!visible} className="private-portfolio-details">{children}</div></>;
}

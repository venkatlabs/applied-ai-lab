'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
const PortfolioLab = dynamic(() => import('./PortfolioLab').then(m => m.PortfolioLab), { loading: () => <p>Loading allocation comparison…</p> });
export function AdvancedComparison() {
  const [open, setOpen] = useState(false);
  return <details className="panel" onToggle={e => setOpen(e.currentTarget.open)}><summary>Compare a custom mix of several holdings</summary>{open && <PortfolioLab usePrivateSnapshot />}</details>;
}

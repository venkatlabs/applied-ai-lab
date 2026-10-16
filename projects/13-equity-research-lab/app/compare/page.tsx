import Link from 'next/link';
import { AmznDecision } from '@/components/AmznDecision';
import { AdvancedComparison } from '@/components/AdvancedComparison';
export default function Compare() {
  return <><Link href="/">← Your portfolio</Link><AmznDecision /><AdvancedComparison /><p><Link href="/activity">Record your decision in Activity →</Link></p></>;
}

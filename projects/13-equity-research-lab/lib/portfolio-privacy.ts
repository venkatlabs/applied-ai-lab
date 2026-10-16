export const PORTFOLIO_REVEAL_TTL_MS = 10 * 60 * 1000;

/** A fixed wall-clock deadline: activity and navigation never extend the reveal. */
export function schedulePrivacyExpiry(deadline: number, expire: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  let cancelled = false;
  function check() {
    if (cancelled) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) expire();
    else timer = setTimeout(check, remaining);
  }
  check();
  return () => { cancelled = true; clearTimeout(timer); };
}

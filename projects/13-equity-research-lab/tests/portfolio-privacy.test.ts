import { describe, it, expect, vi, afterEach } from 'vitest';
import { PORTFOLIO_REVEAL_TTL_MS, schedulePrivacyExpiry } from '../lib/portfolio-privacy';

afterEach(() => vi.useRealTimers());
describe('portfolio reveal deadline', () => {
  it('expires after ten minutes without extending the deadline', () => {
    vi.useFakeTimers();
    const expire = vi.fn();
    schedulePrivacyExpiry(Date.now() + PORTFOLIO_REVEAL_TTL_MS, expire);
    vi.advanceTimersByTime(599999);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });
  it('cancels a reveal when hidden manually', () => {
    vi.useFakeTimers();
    const expire = vi.fn();
    const cancel = schedulePrivacyExpiry(Date.now() + PORTFOLIO_REVEAL_TTL_MS, expire);
    cancel();
    vi.advanceTimersByTime(PORTFOLIO_REVEAL_TTL_MS);
    expect(expire).not.toHaveBeenCalled();
  });
  it('immediately expires a deadline already passed', () => {
    const expire = vi.fn();
    schedulePrivacyExpiry(Date.now() - 1, expire)();
    expect(expire).toHaveBeenCalledTimes(1);
  });
});

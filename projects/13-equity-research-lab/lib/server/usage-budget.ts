import { database } from './supabase';

export interface UsageStore {
  read(provider: string, day: string): Promise<number | null>;
  insert(provider: string, day: string, value: number): Promise<boolean>;
  compareAndSet(provider: string, day: string, previous: number, next: number): Promise<boolean>;
}
export class UsageLimitError extends Error {}

// Reserve BEFORE calling a provider. Failed or interrupted calls keep their reservation.
// A conditional SQL UPDATE is atomic across serverless workers; conflicts retry.
export async function reserveUsage(store: UsageStore, provider: string, day: string, cap: number, floor = 0) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const previous = await store.read(provider, day);
    const used = Math.max(previous ?? 0, floor);
    if (used >= cap) throw new UsageLimitError(`Daily ${provider === 'research' ? 'research' : 'quick-check'} limit reached (${cap} attempts per UTC day). Saved results still open.`);
    const next = used + 1;
    const won = previous === null ? await store.insert(provider, day, next) : await store.compareAndSet(provider, day, previous, next);
    if (won) return next;
  }
  throw new Error('Usage reservation is busy. No provider request was started; try again shortly.');
}

/** Give back one reservation when the provider call provably never ran (for example an expired key). Never below zero. */
export async function releaseUsage(store: UsageStore, provider: string, day: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const previous = await store.read(provider, day);
    if (!previous || previous <= 0) return;
    if (await store.compareAndSet(provider, day, previous, previous - 1)) return;
  }
}

export function usageStore(): UsageStore {
  const db = database();
  if (!db) throw new Error('Provider calls are paused because usage storage is unavailable.');
  return {
    async read(provider, day) {
      const {data,error}=await db.from('equity_provider_usage').select('requests').eq('provider',provider).eq('day',day).maybeSingle();
      if(error)throw new Error('Usage could not be verified; no provider call was started.');
      return data?.requests ?? null;
    },
    async insert(provider,day,requests) {
      const {error}=await db.from('equity_provider_usage').insert({provider,day,requests});
      if(error?.code==='23505')return false;
      if(error)throw new Error('Usage could not be reserved; no provider call was started.');
      return true;
    },
    async compareAndSet(provider,day,previous,requests) {
      const {data,error}=await db.from('equity_provider_usage').update({requests}).eq('provider',provider).eq('day',day).eq('requests',previous).select('requests').maybeSingle();
      if(error)throw new Error('Usage could not be reserved; no provider call was started.');
      return !!data;
    },
  };
}

import type { ResearchRun } from "../types";
import { isRated } from "../outcome";
import { providerFailure } from "../provider-failure";

export class ResearchFailed extends Error { constructor(message: string, readonly kind: string) { super(message); } }

/**
 * One research run with its safety rules in one place.
 * Deep (paid AI) runs: a run that never reached the AI because the key is invalid or out of credit costs nothing, so its
 * budget slot is returned and nothing is saved; other runs that end without an analysis are kept only when the caller
 * wants a partial report to complete later.
 * Light runs (free quick screen, no AI) are saved when they produced a screen.
 */
export async function guardedResearch(d: {
  claim: () => Promise<void>; run: () => Promise<ResearchRun>; save: (run: ResearchRun) => Promise<ResearchRun>; release: () => Promise<void>; keepUnrated: boolean; tier?: "deep" | "light";
}): Promise<ResearchRun> {
  await d.claim();
  const run = await d.run();
  if (d.tier === "light") {
    if (run.tier === "light" && run.screen) return d.save(run);
    throw new ResearchFailed((run.notes ?? [])[0] ?? "The quick screen could not be completed.", "other");
  }
  if (isRated(run)) return d.save(run);
  const failure = providerFailure(run);
  if (failure && (failure.kind === "auth" || failure.kind === "quota")) { await d.release().catch(() => undefined); throw new ResearchFailed(failure.message, failure.kind); }
  if (d.keepUnrated) return d.save(run);
  throw new ResearchFailed(failure?.message ?? "The analysis did not finish.", failure?.kind ?? "other");
}

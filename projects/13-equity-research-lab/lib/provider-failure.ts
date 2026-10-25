import type { ResearchRun } from "./types";

/** Why a run ended without an analysis, read from the notes the research engine records. */
export type ProviderFailure = { kind: "auth" | "quota" | "rate" | "other"; message: string };

const clean = (text: string) => {
  const quoted = /"message"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  return (quoted ?? text.replace(/^Provider note:\s*/i, "").replace(/\s+/g, " ")).slice(0, 180);
};

export function providerFailure(run: ResearchRun): ProviderFailure | null {
  const notes = run.notes ?? [];
  const joined = notes.join(" ");
  const aiNote = notes.find(n => /openai|api key|http \d{3}/i.test(n) && !/tipranks|analyst identities/i.test(n));
  if (/expired_secret_key|invalid_api_key|incorrect api key|http 401|api key (has )?(expired|is invalid)/i.test(joined)) return { kind: "auth", message: `OpenAI rejected the API key: ${aiNote ? clean(aiNote) : "it is invalid or expired"}. Create a new key and update OPENAI_API_KEY.` };
  if (/insufficient_quota|exceeded your current quota|billing|http 402/i.test(joined)) return { kind: "quota", message: `OpenAI reports no remaining credit or quota: ${aiNote ? clean(aiNote) : "check billing"}.` };
  if (/http 429|rate limit/i.test(joined)) return { kind: "rate", message: `OpenAI is rate limiting requests: ${aiNote ? clean(aiNote) : "try again shortly"}.` };
  if (!run.investmentCase && /synthesis failed|did not complete|stopped before ai synthesis/i.test(joined)) return { kind: "other", message: aiNote ? clean(aiNote) : "The analysis did not finish." };
  return null;
}

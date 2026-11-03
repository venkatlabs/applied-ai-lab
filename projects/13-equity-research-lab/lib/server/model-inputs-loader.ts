import { buildModelInputs, type ModelInputsResult } from "../model-inputs";

/** The one SEC call the loader needs; `SecProvider` satisfies it. Injected so tests never touch the network. */
export type CompanyFactsSource = { getCompanyFacts(ticker: string): Promise<unknown> };

const TICKER = /^[A-Z][A-Z.\-]{0,9}$/;

/**
 * Fetches SEC companyfacts for one ticker and builds the model's opening statements.
 * Never throws: a bad ticker or a failed SEC call returns an unavailable result with the reason,
 * so a caller cannot mistake a fetch failure for a company with nothing to report.
 * Spends no paid provider call; SEC data is free and rate-limited by the provider's own headers.
 */
export async function loadModelInputs(
  rawTicker: string,
  source: CompanyFactsSource,
  opts: { confirmNoDebt?: boolean; asOf?: string } = {},
): Promise<ModelInputsResult & { ticker: string }> {
  const ticker = String(rawTicker ?? "").trim().toUpperCase();
  if (!TICKER.test(ticker)) return { available: false, reasons: ["Invalid ticker symbol."], ticker };
  let facts: unknown;
  try {
    facts = await source.getCompanyFacts(ticker);
  } catch (e) {
    const why = e instanceof Error ? e.message : "unknown error";
    return { available: false, reasons: [`SEC company facts could not be retrieved for ${ticker}: ${why}`], ticker };
  }
  return { ...buildModelInputs(facts, opts), ticker };
}

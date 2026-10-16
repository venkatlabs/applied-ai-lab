# Current affairs evidence

Propose at most six dated events that could matter to the 12-month case: company, sector, industry, macro, regulatory or competitor.

- `source` must be an exact URL from the source catalog; `publishedDate` is that source's publication date (YYYY-MM-DD).
- `evidenceKind`: Direct company evidence (company-specific fact), Sector spillover (sector/industry/macro/competitor effect), Model interpretation (your inference).
- Never claim a headline caused a price move; code reclassifies such text as interpretation.
- `mechanism` is one sentence on how the event could affect the thesis. `uncertainty` is Low/Medium/High; stale (>90 days) or interpretive items cannot be Low.
- List missing recent coverage under `gaps`. Return no events if nothing qualifies.
- Events are context only: they do not change the score, which stays the deterministic six-factor result.

# Portfolio display privacy

Portfolio amounts, quantities, weights and comparison details start hidden. Show numbers reveals them for a fixed ten minutes across in-app navigation. Hide numbers ends the reveal immediately. A full reload starts hidden again. The reveal is never persisted. Hidden panels remain mounted so unsaved edits and results survive hiding; native hidden/inert attributes remove them from display, keyboard and accessibility navigation. This is display privacy, not encryption or access control.

Public stock prices and research metrics remain visible. Portfolio home keeps ticker names and review/comparison links available while masking its private details.

Validation: 183 tests, TypeScript and production build pass. Fake-clock tests cover exact ten-minute expiry, manual cancellation and past deadlines. Local production browser verified default hiding, reveal/hide, unsaved form retention, navigation retention and reload reset. No provider calls, account refresh or trades.

# Charlie stability and accuracy pass

Date: 14 November 2026. Branch: `codex/charlie-improvements`.

Scope: improve existing panels and shared data paths before adding product features. Market, economic and news inputs remain public/free; the user's configured OpenAI service is an allowed paid exception. No new paid data service was added. Opportunities is unmounted and removed from desktop/mobile shortcuts, Help, command suggestions and Companion mentions; a future replacement is a proposal only.

## November 24 update

Macro charts now show source-backed date ranges with individual and dashboard-wide controls. Payroll levels and changes use individual jobs. News opens the Global Event Map with country hotspots in the same card. Yahoo Finance and GDELT supply its headlines, with the GDELT archive available when DOC search fails. The map automatically shows only OpenAI-reviewed incidents and explains when a review is incomplete or unavailable. The player docks inside News. Card order, width and height are saved. The checks below describe the earlier November 14 baseline.

## Changes and evidence

| Area | Defects addressed | Evidence |
| --- | --- | --- |
| Overview | Mixed currencies and missing quotes could become false portfolio totals; missing sector changes became zero; sample movers were overgeneralized; unnecessary news fan-out on startup | Shared valuation fixtures and browser rendering |
| Portfolio | History refetched with lot/FX changes; all assets blocked the chart; inappropriate axis padding; synthetic history; incomplete coverage; minor-unit prices | Independent history queries, visible-range scale and explicit coverage; valuation/history/CSV regressions |
| Equity / Chart / Multi-asset | Refresh errors hid valid data; empty charts retained old bars; current prices overwrote past candles; custom ranges returned unrelated history; missing metadata could mis-scale prices | AAPL/SEC/1D browser checks, range/normalization fixtures, per-workspace error boundaries |
| Macro / Calendar / Yield | Indistinguishable lines, gaps connected, mixed definitions hidden, old observations undisclosed, supplements blocked by FRED; fuzzy GDP calendar match; unsupported recession label | Display/source fixtures, exact official FRED release IDs, repeated-read cache regression, browser dashboard/compare/yield |
| News / Geopolitics | GDELT could hold up the full view; source failures looked empty; paid classification ran during ordinary browsing; event/mention semantics mixed | Partial-source/cancellation fixtures; fast coverage plus explicit retained AI event analysis; browser public-feed checks |
| Heatmap | Treemap read wrong node shape and could render blank; fake market-cap weights; absent moves treated as zero; sample confused with full index | Recharts-shape/coverage/weight fixtures; real quotes and sizing toggle in browser |
| FX / ETF | Weak unavailable/failed-refresh states; invalid amount parsing; implied real-time precision | Bounded requests, last-data retention and indicative labels; browser conversion/ETF checks |
| Crypto / Predictions | Sample capitalization described as whole market; ticker collisions; tiny prices rounded to zero; probability rounding implied certainty; deadline year omitted | Finite/identity/format fixtures and browser source/price/deadline checks |
| Shared shell / Settings / Help / Companion | Heavy panels loaded eagerly; transient workspace errors could take down app; search fired per keystroke; AI context repeated incorrect portfolio arithmetic | Lazy loading, error containment/reload, debounced search, consistent currency-aware Companion fixtures and refreshed copy |

## Saved-state startup

A fresh app profile could initialize the store with empty defaults and persist them before the asynchronous disk mirror had loaded. Startup now defers automatic store hydration, loads the mirror, and restores the live store before rendering. A separate regression imports the real store into a browser-like empty-cache environment, asserts that no default-state PUT occurs before hydration, and verifies holdings survive the first navigation. Invalid browser cache alone no longer triggers deletion of the disk mirror.

## Backend protections

Public-data reads have bounded waits and short successful caches, coalesce independent reads where safe, and never cache a failed request as successful empty data. News retains successful feeds when another fails. FRED requests share successful results without mutating cached arrays, avoid missing-key fan-out, and respect long rate-limit cooldowns without holding the UI asleep. Provider proxies have timeouts and tolerate errors after headers were sent. OpenAI event/summary requests retain disconnect and timeout handling through the complete response body.

## Validation

Focused checks: startup persistence, public data, portfolio/history/CSV/Companion, market display, news coverage, SEC EDGAR, BLS, macro sources, legacy Opportunities quality and Early Signals, and secret-pattern scan. TypeScript and production build pass. Browser coverage includes every current workspace plus desktop and narrow-mobile layouts. A single explicit production AI-event run completed (8/8 headlines, 1 batch, 1 mapped country/event) and a linked country summary rendered. GDELT was unavailable and disclosed; Yahoo coverage continued. At390px, loaded Heatmap and News both fit the document width, and News retained reachable source/risk sections. FX invalid input, Crypto sub-cent precision, prediction-year/probability labels, and Macro older-observation badges were checked. A separate memory-only preview and fresh Electron profile verified the Portfolio interactions without touching saved holdings: one sample AAPL share retained through startup,219 one-year observations, six 7-day observations with a $340–$360 axis,23 one-month observations with a $320–$360 axis; enabling cost basis expands the range to include the $200 purchase cost. None selection shows a clear empty state. Chart paths were finite and visible. The isolated server was stopped after verification; the ordinary production preview remains available.

## Limits retained explicitly

Free quotes can be delayed, incomplete or unavailable; these checks do not establish continuous provider uptime. Some old international macro contracts remain old, with dates and age labels rather than invented updates. Cross-country GDP, inflation and short-rate definitions are not fully homogeneous. Portfolio history uses current FX conversion, includes purchases/capital changes, and omits dividends, fees and closed positions; it is not a total-return or time-weighted performance series. Country headline coverage is not a comprehensive event count or geopolitical-risk estimate. AI event labels and summaries remain model assessments backed by links, not verified facts.

No code changes from this pass have been committed, pushed or merged. Review the running version before publishing.

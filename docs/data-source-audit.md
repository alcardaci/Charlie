# Charlie Data Source Audit

Audit date: 2026-04-08

This document inventories the external data sources currently wired into Charlie, how each one is used in the codebase today, and what that implies for a future public GitHub release, hosted web app, and mobile-friendly version.

The goal of this audit is not just to list vendors. It is to answer four product questions for each source:

- Is the source public or secret-backed today?
- Is it currently tied to Alberto's local machine or server environment?
- Can it reasonably become bring-your-own-key or bring-your-own-connection?
- Should it stay enabled in a public hosted deployment, move to optional mode, or remain local/self-hosted only?

## Audit basis

This audit is based on the current implementation in:

- `vite.config.ts`
- `src/api/finance.ts`
- `src/api/crypto.ts`
- `src/panels/HelpPanel.tsx`
- `.env.example`

It also reflects the currently mounted panel set after the trade disruption monitor removal.

## Executive summary

Charlie currently uses three broad integration types:

- Public sources with no secret in the current implementation
- Secret-backed sources proxied through the local app runtime
- Local-machine-only credential storage through macOS Keychain

For a public hosted version, the sources fall into three practical buckets:

- Good public-hosted candidates now:
  - CoinGecko
  - Polymarket Gamma API
  - GDELT DOC 2.0
  - Caldara-Iacoviello GPR dataset
  - Static local policy calendar data
- Possible bring-your-own-key candidates, but they need a provider-settings model and browser-compatibility verification:
  - OpenAI
  - FRED
  - Finnhub
  - TheNewsAPI
- Poor fits for a public bring-your-own-connection site in their current form:
  - Yahoo Finance via `yahoo-finance2`
  - Teleborsa / FIDA HTML parsing

One important clarification: no Alpha Vantage, AlphaFinance, or similar integration appears to be present in the current codebase.

## Deployment classification

| Source | Current access model | Current secret location | Current panels / flows | Hosted public recommendation |
| --- | --- | --- | --- | --- |
| OpenAI Responses API | Local proxy routes in `vite.config.ts` | macOS Keychain on the local machine | Overview AI summary, Panel Companion, geopolitics extraction/summaries, OPPS AI guidance | Convert to optional BYOK per device; do not ship your own key |
| Yahoo Finance via `yahoo-finance2` | Server middleware using unofficial Yahoo access | No app secret, but server-side runtime dependency | Overview, ticker, chart, news, portfolio repricing, heatmap, ETF, FX, yield, OPPS inputs | Replace for hosted public mode or limit to local/self-hosted mode |
| Teleborsa / FIDA | Server-side HTML scraping / parsing | No app secret | Fund fallback quotes, search, workbench, charts | Keep local/self-hosted only unless replaced |
| FRED | Local proxy route with user-managed credential | macOS Keychain on the local machine | Macro dashboard, release calendar | Good fit for optional BYOK on desktop; evaluate browser-safe hosted mode separately |
| Finnhub | Local proxy route with user-managed credential | macOS Keychain on the local machine | Earnings calendar in macro calendar flow | Good fit for optional BYOK on desktop; evaluate browser-safe hosted mode separately |
| TheNewsAPI | Local proxy route with user-managed credential | macOS Keychain on the local machine | Supplemental geopolitics headlines | Optional BYOK on desktop; still optional in any hosted public version |
| GDELT DOC 2.0 | Public no-key API through local proxy/cache | None | Geopolitics headline intake | Safe for public mode, preferably with caching |
| Caldara-Iacoviello GPR dataset | Public dataset fetched server-side | None | Geopolitics risk snapshot and chart | Safe for public mode, preferably cached |
| CoinGecko | Public API through proxy | None | Crypto panel | Safe for public mode |
| Polymarket Gamma API | Public API through proxy | None | Predictions panel, Overview, OPPS | Safe for public mode |
| Static policy calendar registry | Bundled local data | None | Macro calendar | Safe for public mode |

## Source-by-source inventory

### 1. OpenAI Responses API

Current implementation:

- Used through `/api/openai/*` routes in `vite.config.ts`.
- Used for:
  - overview summary generation
  - panel companion chat
  - geopolitical event extraction
  - geopolitical country hotspot summaries
  - OPPS theme discovery
  - OPPS topic guidance
- The raw key is not stored in browser state. It is written to and read from macOS Keychain.
- Client state stores only a configured flag plus non-secret model and prompt settings.

Current risk / limitation:

- This works well for Alberto's local desktop setup.
- It does not translate cleanly to a public website because a hosted site cannot depend on the visitor having access to Alberto's macOS Keychain.

Hosted-web direction:

- This should become optional BYOK.
- Each user should enter their own OpenAI key in a `Connections` or `AI Settings` panel.
- On the web, the key should stay device-local at first.
- For cross-device sync, do not sync raw keys in v1.

Recommendation:

- Keep OpenAI support.
- Rework it into per-user, per-device configuration.

### 2. Yahoo Finance via `yahoo-finance2`

Current implementation:

- `vite.config.ts` mounts `/api/yf/*` routes for:
  - quote baskets
  - chart history
  - quote summaries
  - insights
  - fundamentals time series
  - symbol search
- `src/api/finance.ts` uses these routes heavily across the app:
  - quotes and cross-asset baskets
  - company workbench
  - chart data
  - symbol search
  - news feeds and archive search
  - portfolio repricing
  - sentiment inputs

Panels and flows affected:

- Overview
- Ticker research
- Chart
- News
- Portfolio
- Heatmap
- ETF
- Forex
- Yield
- OPPS deterministic inputs
- Parts of geopolitics headline intake

Current risk / limitation:

- This is not a user-brings-their-own-key source in the current design.
- It is also not an official user-owned connection model.
- The hosted site would still depend on your server runtime and the behavior of an unofficial Yahoo access layer.

Hosted-web direction:

- This is the biggest blocker to a clean public deployment.
- In a public hosted version, this source should either:
  - be replaced with official browser-friendly data vendors, or
  - be reserved for local/self-hosted mode only.

Recommendation:

- Treat Yahoo-backed functionality as a migration target, not as a public hosted foundation.

### 3. Teleborsa / FIDA fallback parsing

Current implementation:

- `vite.config.ts` mounts `/api/tmf/*` routes that fetch and parse Teleborsa fund pages and chart pages.
- This is used as a fallback for mutual-fund-like instruments when Yahoo coverage is weak.
- The parsing layer builds quote, search, chart, and workbench responses from HTML.

Panels and flows affected:

- Ticker research for supported fund-like symbols
- Symbol search
- Chart fallback
- Quote fallback

Current risk / limitation:

- This is server-side HTML scraping/parsing, not a first-class vendor integration.
- It is not a realistic BYOK pattern for a public website or mobile app.

Hosted-web direction:

- Do not base a public deployment on this source.
- Either keep it self-hosted/local only or replace it with an official provider that supports browser-safe or clearly authorized server access.

Recommendation:

- Mark this source as local/self-hosted only in the future deployment plan.

### 4. FRED

Current implementation:

- `vite.config.ts` proxies `/api/fred/*` and reads the credential from local Keychain-backed connections state.
- `src/api/finance.ts` uses FRED for:
  - macro series lookup
  - macro observations
  - release catalog and release dates
- The macro dashboard also uses a curated series registry to normalize multiple country metrics into one comparable UI.

Panels and flows affected:

- Macro dashboard
- Macro compare
- Overview macro calendar
- OPPS macro calendar input
- Panel companion macro context

Current risk / limitation:

- In a public hosted deployment today, visitors would consume the site's shared FRED quota.
- The current flow is server-owned, not user-owned.

Hosted-web direction:

- Good candidate for optional BYOK if direct browser usage is acceptable.
- If browser-side usage is not acceptable, it should be disabled in hosted public mode and retained only for self-hosted/local setups.

Recommendation:

- Keep FRED in the product model, but rework it into optional user configuration for hosted mode.

### 5. Finnhub

Current implementation:

- `vite.config.ts` proxies `/api/finnhub/*` and reads the credential from local Keychain-backed connections state.
- `src/api/finance.ts` uses Finnhub for:
  - earnings calendar
  - economic calendar helper functions, though the current macro release view mainly combines earnings plus FRED release dates

Panels and flows affected:

- Macro calendar
- Overview upcoming releases
- OPPS base-input calendar

Current risk / limitation:

- Same hosted-public issue as FRED: the shared site would spend your quota.

Hosted-web direction:

- Reasonable candidate for optional BYOK if browser-side use is acceptable.
- If not, it should be disabled in the public hosted build.

Recommendation:

- Keep as optional and user-configured, not site-owned.

### 6. TheNewsAPI

Current implementation:

- `vite.config.ts` proxies `/api/thenews/search` with a locally stored user credential.
- `src/api/finance.ts` uses it only as a supplemental geopolitics feed.
- If the token is missing, the route returns an empty list and the geopolitics pipeline continues without it.

Panels and flows affected:

- Geopolitics panel
- Country hotspot pipeline
- OPPS, indirectly, through geopolitics counts

Current risk / limitation:

- Optional today, but still server-owned in the hosted model.

Hosted-web direction:

- This is a good candidate for either:
  - optional BYOK, or
  - disabling in public hosted v1 while keeping the geopolitics panel alive on Yahoo + GDELT + GPR

Recommendation:

- Do not treat this as required for launch.
- Keep it optional.

### 7. GDELT DOC 2.0

Current implementation:

- `vite.config.ts` uses `https://api.gdeltproject.org/api/v2/doc/doc`.
- The app proxies and caches GDELT geopolitical queries through `/api/gdelt/geopolitics`.
- The middleware adds rate-limit handling, stale-cache fallback, and response normalization.
- `src/api/finance.ts` uses it as one of the mixed feeds for the geopolitics event map.

Panels and flows affected:

- Geopolitics panel
- Geopolitics map
- Country hotspot pipeline
- OPPS, indirectly, through geopolitical counts

Current risk / limitation:

- No secret risk.
- There is still an operational concern around rate limits and latency, which the current proxy already mitigates.

Hosted-web direction:

- This is a good public source.
- Even without secrets, it is probably still worth keeping a thin cache layer or edge cache because the app already depends on freshness windows and rate-limit smoothing.

Recommendation:

- Keep enabled in hosted public mode.

### 8. Caldara-Iacoviello Geopolitical Risk dataset

Current implementation:

- `vite.config.ts` fetches the official XLS dataset and transforms it into a normalized snapshot at `/api/gpr/snapshot`.
- `src/api/finance.ts` consumes this for the geopolitical risk panel and chart.

Panels and flows affected:

- Geopolitics panel
- Panel companion geopolitics context

Current risk / limitation:

- No secret risk.
- The source is public, but it is still fetched server-side and normalized.

Hosted-web direction:

- Safe for public mode.
- Better if cached because the source is a downloadable workbook, not a small JSON endpoint.

Recommendation:

- Keep enabled in hosted public mode.

### 9. CoinGecko

Current implementation:

- `src/api/crypto.ts` fetches `/api/coingecko/api/v3/coins/markets`.
- `vite.config.ts` proxies requests to `https://api.coingecko.com`.

Panels and flows affected:

- Crypto panel
- Panel companion crypto context

Current risk / limitation:

- No secret in the current implementation.

Hosted-web direction:

- Good public candidate.
- Could remain proxied or move client-side if browser compatibility is acceptable.

Recommendation:

- Keep enabled in hosted public mode.

### 10. Polymarket Gamma API

Current implementation:

- `vite.config.ts` fetches Polymarket events from the Gamma API and normalizes them into a capped forecast set at `/api/polymarket/forecasts`.
- `src/api/finance.ts` uses the normalized forecast snapshot in the prediction panel, overview, and OPPS.

Panels and flows affected:

- Predictions panel
- Overview prediction snapshot
- OPPS theme inputs
- Panel companion overview/predictions context

Current risk / limitation:

- No secret in the current implementation.

Hosted-web direction:

- Good public candidate.
- Retaining a normalization/cache layer is still useful because the app wants a compact curated forecast set, not the raw upstream response.

Recommendation:

- Keep enabled in hosted public mode.

### 11. Static policy schedule registry

Current implementation:

- Calendar policy events are bundled in local app code.
- `src/api/finance.ts` merges static policy events with FRED release dates and Finnhub earnings.

Panels and flows affected:

- Macro calendar
- Overview calendar
- OPPS base input

Current risk / limitation:

- No secret risk.
- The only issue is ongoing maintenance of the static schedule.

Hosted-web direction:

- Safe for public mode.

Recommendation:

- Keep enabled.

## Current secret handling

### Secrets already kept out of Git

- `.env` files are ignored by Git.
- `.env.example` no longer contains active provider placeholders because the desktop app now expects users to configure keys from inside the app.
- OpenAI, FRED, Finnhub, and TheNewsAPI are stored locally in macOS Keychain for the desktop workflow.

### Secrets that are still site-owned in the current desktop architecture

- None by default

For the local macOS app, keyed providers are now owned by the user on their own machine. A future public hosted version would still need a separate decision about whether those providers should stay local-only or support browser-safe BYOK.

### Secrets that are currently device-owned

- OpenAI
- FRED
- Finnhub
- TheNewsAPI

## Hosted public app implications

To make the hosted site safe for public use, the product should stop assuming that the backend owns user-facing credentials.

That means:

- Public-safe sources can stay on by default.
- Keyed sources should default to `Not configured`.
- The UI should expose a per-provider connection model.
- Panels should degrade gracefully when a source is not configured.

## Recommended provider model

### Default-on public sources

- CoinGecko
- Polymarket
- GDELT
- GPR
- Static policy calendar

### Optional BYOK sources

- OpenAI
- FRED
- Finnhub
- TheNewsAPI

### Local/self-hosted only until replaced

- Yahoo Finance via `yahoo-finance2`
- Teleborsa / FIDA parsing

## Product recommendation

The cleanest product split is:

### Hosted public mode

- Enable only public sources by default.
- Let users add their own OpenAI and supported keyed providers locally on each device.
- Hide or disable features that still depend on Yahoo or Teleborsa until those dependencies are replaced.

### Local / self-hosted mode

- Preserve the current richer setup for power users.
- Allow `.env` and machine-local secret handling.
- Keep unofficial and scraping-based integrations here if needed.

## Implementation implications

The future implementation plan should include these building blocks:

1. A `Connections` settings panel

- One row per provider
- Status states such as `Not configured`, `Connected`, `Unavailable on web`, `Self-hosted only`
- Clear copy explaining what the provider powers

2. Provider-aware feature gating

- The Macro panel should still render if FRED is missing, but with a clear disconnected state.
- The Geopolitics panel should still work without TheNewsAPI.
- AI workflows should disappear or downgrade cleanly if OpenAI is not configured.

3. Device-local secret storage for the hosted web app

- Store provider keys locally per device in browser storage in v1.
- Sync only non-secret state at first.

4. A source replacement plan

- The biggest hosted-public blocker is not OpenAI.
- It is the broad Yahoo-backed market-data layer, followed by the Teleborsa fallback.

## Immediate next questions

The next technical pass should answer these source-specific questions before implementation starts:

- Which Yahoo-backed features do we want to keep in the first hosted public release?
- Which replacement provider should own core quote, chart, company, and news coverage in hosted mode?
- Which keyed providers are acceptable for browser-local BYOK, versus self-hosted-only?
- Which panels should ship in hosted public v1 if some providers are intentionally unavailable?

## Bottom line

Charlie is already close to a split architecture, but not all sources are equally ready for public deployment.

- OpenAI is straightforward to convert into user-owned configuration.
- FRED, Finnhub, and TheNewsAPI can likely become optional BYOK connections.
- GDELT, GPR, CoinGecko, Polymarket, and static policy data are good public-mode foundations.
- Yahoo Finance and Teleborsa are the main blockers to a clean public-hosted, bring-your-own-credentials model in the current codebase.

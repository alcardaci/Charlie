# Charlie App Overview and Panels

## What Charlie is

Charlie is a terminal-style market workspace built with React, Vite, Tailwind, Zustand, and React Query.
It keeps a command-driven shell around a routed center panel, then layers persistent market context around it:

- `CommandBar`: command entry, panel routing, search/autocomplete, theme toggle, debug toggle, and AI companion toggle
- `MarketTicker`: always-on quote strip
- `WatchlistSidebar`: saved symbols and quick navigation
- `MainPanel`: the active workspace
- `NewsPanel`: either the top half of the combined `NEWS`/`GEO` workspace or a right-hand rail, depending on the current tab
- `StatusBar`: function-key shortcuts and market-open state
- `CharlieLivePlayer`: floating live TV player
- `PanelCompanion`: optional general-purpose AI chat and web-research layer with automatic Charlie workspace context and local conversation history

## Navigation model

- Default panel: `overview`
- Bare ticker input such as `AAPL` opens the equity workspace
- Ticker subcommands:
  - `<TICKER> GP` or `<TICKER> CHART`: chart workspace
  - `<TICKER> NEWS`: ticker-specific news feed
  - `<TICKER> WL`: add the symbol to the watchlist
- Named workspaces:
  - `OPPS`, `NEWS`, `GEO`, `PRED`, `MACRO`, `PORT`, `HEAT`, `FX`, `CRYPTO`, `ETF`, `HELP`, `SETTINGS`
  - `SETTINGS` / `AI` / `CONFIG`
- `YIELD`, `WIRP`, and `BYFC` are still accepted, but they route into the merged macro workspace rather than a separate yield panel
- `SCREEN` / `EQS` still exist in command parsing, but no screener panel is mounted

## State, persistence, and runtime shape

- Theme follows the OS by default and persists locally once changed
- Watchlist, portfolio lots, command history, selected symbol, and panel preferences persist through local mirrored storage
- React Query handles the read-side data lifecycle, including refresh cadence and cache windows
- The app uses local proxy routes inside `vite.config.ts` for provider calls that need normalization, throttling, or secret handling
- User-managed provider credentials are stored locally on the machine running Charlie rather than in browser storage or the public repository

## Current data-source map

### Core market and company data

- Yahoo Finance via `yahoo-finance2`
  - Quotes, chart data, symbol search, company profiles, recommendation data, holders, filings, and headline feeds
- Teleborsa / FIDA fallback parsing
  - Used when Yahoo coverage is weak for selected mutual funds and fund-style instruments

### Macro and calendar data

- FRED
  - Macro dashboard series, cross-country macro snapshots, and rate/growth/inflation indicators
- Finnhub
  - Earnings-calendar support used inside the macro calendar flow
- Local policy calendar registry
  - Static policy-event schedule data bundled in `src/data/policyCalendar.ts`

### News and geopolitical data

- Yahoo Finance news/search
  - General market headlines, ticker news, topic feeds, and some geopolitics candidate stories
- GDELT DOC 2.0
  - Supplemental geopolitical story intake and clustering support
- Caldara-Iacoviello GPR dataset
  - Official geopolitical risk time series used by the geopolitics panel

### Other market data

- CoinGecko
  - Crypto prices, rankings, market caps, volume, and breadth inputs
- Polymarket Gamma API
  - Prediction-market contracts, implied probabilities, liquidity, and volume

### AI-assisted workflows

- OpenAI Responses API
  - Overview summary generation
  - General-purpose companion chat and live web research
  - Optional active-panel and cross-panel analysis
  - Geopolitics event extraction and hotspot summarization
  - Opportunities theme discovery/guidance when AI is enabled

## Workspace inventory

### 1. Market Overview (`HOME`, `OVERVIEW`, `WB`, `WL`)

What it contains:

- Major US index cards
- Sector ETF performance grid
- Big-cap movers
- Cross-asset quotes for commodities and major currencies
- Sentiment regime summary plus underlying sentiment pillars
- Portfolio snapshot
- Prediction-market snapshot
- Upcoming macro calendar
- Optional AI-written market summary

Data sources:

- Yahoo Finance for indices, sectors, movers, cross-asset quotes, and most news context
- Derived sentiment model built from live Yahoo quote inputs
- Polymarket for forecast cards
- FRED/Finnhub-backed local calendar endpoint for upcoming releases when the user has configured those providers
- OpenAI for the optional narrative summary

How it is processed:

- The panel fetches several quote baskets independently so cards can refresh on different cadences
- The sentiment section is not a vendor feed; it is computed locally from a fixed cross-asset basket
- Multi-topic news is merged and deduplicated before being passed into the overview AI summary request
- Portfolio holdings are repriced from live quotes to create the overview allocation and P/L snapshot

### 2. Opportunities (`OPP`, `OPPS`, `OPPORTUNITIES`, `THEMES`, `DISCOVERY`)

What it contains:

- A live discovery workspace
- A user-driven topic workspace based on typed themes
- Theme cards, signal counts, linked assets, and optional AI refinement
- A connection gate when no OpenAI key is configured locally

Data sources:

- Yahoo Finance topic feeds
- Geopolitics hotspot counts from the geopolitics pipeline
- Macro release calendar
- Polymarket forecasts
- Derived market sentiment
- OpenAI for optional discovery and guidance passes

How it is processed:

- If no OpenAI key is configured locally, the panel does not populate and instead prompts the user to open `SETTINGS`
- The panel first assembles a shared base snapshot from news, geopolitics, macro, prediction, sentiment, watchlist, portfolio, and quotes
- A deterministic clustering engine turns those signals into themes even without AI
- If AI is enabled, the same normalized signal payload is sent for theme labeling and higher-level guidance
- The custom-topic side separately searches the archive for the user’s requested topics, merges in extra quote context, then builds topic-specific dashboards

### 3. Equity Research (`<TICKER>`)

What it contains:

- Quote header and company profile
- Recommendation trends
- Ownership and holder context
- Filings/developments
- Financial statements and ratio-oriented company workbench sections

Data sources:

- Yahoo Finance for the primary workbench and financial statements
- Teleborsa / FIDA fallback for selected fund-like symbols
- Yahoo quotes for sector ETF comparison

How it is processed:

- The panel fetches a normalized company workbench object plus a separate financials payload
- It resolves sector ETF context from the company metadata, then fetches that ETF quote as a lightweight benchmark
- Symbol changes automatically invalidate the relevant research queries

### 4. Chart (`<TICKER> GP`, `<TICKER> CHART`)

What it contains:

- Interactive price chart
- Multiple timeframes and chart styles
- Technical overlays such as moving averages
- Live quote context around the selected symbol

Data sources:

- Yahoo Finance chart history and live quote data
- Teleborsa fallback chart parsing for instruments where Yahoo history is weak

How it is processed:

- Chart requests flow through a normalized chart-window API that aligns range, interval, and requested date windows
- The panel refreshes intraday views more often than longer-range views
- Returned rows are normalized into a consistent chart-point format before rendering

### 5. News + Geopolitics (`NEWS`, `TOP`, `GEO`, `GEOPOL`, `GEOPOLITICS`, `WORLD`)

What it contains:

- General market or ticker-specific headlines
- Topic shortcuts
- Geographic filters
- Search/archive mode
- Compact and extended display modes
- Official geopolitical risk cards and chart
- Global event map with country clustering and hotspot summaries

Data sources:

- Yahoo Finance news/search endpoints
- Caldara-Iacoviello GPR dataset
- GDELT DOC 2.0
- Yahoo Finance headlines
- OpenAI for event extraction and summarization

How it is processed:

- The top news section still switches between ticker mode and topic-feed mode depending on navigation state
- Topic feeds can combine several related Yahoo queries, then deduplicate the result set
- Archive search narrows the feed by topic, lookback window, and region before display
- Mixed headlines are ingested and deduplicated into a common `NewsItem` shape
- Headlines are classified into countries/events, then grouped into country-level hotspot counts
- The risk index is fetched separately from the official dataset and shown alongside the faster-moving headline map
- AI is optional and used as an enrichment step rather than as the only hotspot pipeline

### 6. Prediction Markets (`PRED`, `PMKT`, `POLY`, `PREDICTIONS`, `POLYMARKET`)

What it contains:

- Forecast cards
- Probabilities, leading outcomes, liquidity, and volume
- Theme/category context

Data sources:

- Polymarket Gamma API

How it is processed:

- The app requests a capped forecast set, normalizes contract metadata, and ranks it into a compact snapshot
- The same normalized forecast objects are reused in overview and opportunities workflows

### 7. Macro + Yield (`MACRO`, `ECO`, `ECON`, `YIELD`, `WIRP`, `BYFC`)

What it contains:

- Country-level macro dashboard cards
- Comparative macro views
- Yield and policy-sensitive context inside the same workspace
- Release calendar integration

Data sources:

- FRED-backed macro series when configured
- Finnhub-backed earnings-calendar support where applicable
- Static policy schedule registry

How it is processed:

- The panel fetches either a single-country or multi-country macro dashboard payload
- The backend maps many raw series into a smaller curated metric set so the UI can compare countries consistently
- Calendar and rate context are presented together to keep macro interpretation and catalyst timing in one place

### 8. Portfolio (`PORT`, `PORTFOLIO`)

What it contains:

- Lot-based holdings table
- Allocation and exposure views
- Position-level gain/loss
- Import/export tools
- Portfolio history chart

Data sources:

- Local persisted portfolio state
- Yahoo Finance quotes and chart history
- Yahoo/Teleborsa symbol search helpers for adding/editing symbols

How it is processed:

- Holdings are stored as lots, not just net positions
- Quote refreshes reprice each lot into current market value and portfolio weights
- History is reconstructed from current lots plus fetched chart series for the selected timeframe
- CSV import maps a few supported schema variants into the internal lot model

### 9. Heatmap (`HEAT`, `MAP`, `SPX`)

What it contains:

- Sector heatmap
- Constituent-level performance tiles
- Relative leadership and concentration view

Data sources:

- Yahoo Finance quotes for a curated sector-and-constituent universe

How it is processed:

- Constituents are arranged into predefined sector buckets rather than discovered dynamically
- Live quotes are transformed into color and size signals for a visual breadth/leadership view
- The panel favors fast quote snapshots over deeper fundamentals

### 10. Forex (`FX`, `FXIP`, `FOREX`)

What it contains:

- Custom FX pair monitor
- Conversion helpers
- Quick performance read across the saved pair set

Data sources:

- Yahoo Finance forex quotes

How it is processed:

- Stored user pair strings are normalized to a strict `AAA/BBB` format
- Those pairs are translated into quote symbols, fetched together, and normalized back into FX-centric display rows

### 11. Crypto (`CRYPTO`, `XBT`, `BTC`)

What it contains:

- Breadth/rank table
- Leaderboard-style market view
- Price, market cap, volume, and 24-hour move context

Data sources:

- CoinGecko

How it is processed:

- The panel requests a ranked asset list in USD terms
- Returned assets are displayed mostly as-is, with lightweight sorting and formatting in the UI

### 12. ETF Monitor (`ETF`, `ETFS`)

What it contains:

- Curated ETF tables across sectors, fixed income, commodities, and international exposures
- Quick comparative performance view

Data sources:

- Yahoo Finance quotes

How it is processed:

- The panel uses a fixed ETF universe grouped into strategy buckets
- Quotes are fetched in one batch, then sliced into category tables

### 13. Help (`HELP`)

What it contains:

- Command reference
- Workspace index
- Data-source summary
- Keyboard shortcuts

Data sources:

- Static in-app documentation plus some runtime debug-mode conditionals

How it is processed:

- This is a descriptive panel rather than a data panel
- It documents the live command surface, including the local Connections and AI Settings panel

### 14. Settings (`SETTINGS`, `SETUP`, `CONFIG`, `AI`)

What it contains:

- Local connection status for OpenAI, FRED, and Finnhub
- Per-provider add/remove actions
- Model selection
- Prompt controls for overview workflows
- Bottom-bar shortcut access on `F12`

Data sources:

- Local Keychain-backed provider credential state
- Local persisted OpenAI settings

How it is processed:

- The panel never stores raw provider secrets in browser state
- It keeps only non-sensitive status or model metadata in app state, while the actual secrets live in local machine storage

## Non-panel areas that change panel behavior

### Watchlist sidebar

- Local persistent watchlist state
- Quick-open routing into equity workspaces

### Right-side news rail

- Usually visible on desktop
- Hidden when the active workspace already needs more room, such as `news`, `geopolitics`, `predictions`, or `opportunities`

### Panel companion

- Answers general questions independently of the current Charlie workspace
- Decides automatically whether web search is useful, returns source links when research is performed, and offers a per-request “force web” override
- Offers seven model choices from low-cost Nano through GPT-5.6 Sol, with the lowest-cost model selected by default
- Places model selection and web-search mode inside the message composer
- Always receives the active panel as supporting context and decides whether it is relevant; typing `@` in the composer opens an autocomplete menu for explicitly forcing additional panel context
- Panel context uses visible text and supplements it with structured snapshots fetched through React Query
- Stores up to 30 recent conversations locally, capped at 60 messages per conversation
- Expands from the side companion into a dedicated full-page workspace without resetting the active conversation, draft, model, web mode, panel mentions, or history view

## Current implementation notes

- `YieldPanel.tsx` still exists in the codebase, but user navigation routes yield aliases to the macro panel
- Screener-style command aliases still parse, but no screener workspace is mounted

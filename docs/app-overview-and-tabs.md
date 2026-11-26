# Charlie App Overview and Panels

## What Charlie is

Charlie is a terminal-style market workspace built with React, Vite, Tailwind, Zustand, and React Query.
It keeps a command-driven shell around a routed center panel, then layers persistent market context around it:

- `CommandBar`: command entry, panel routing, search/autocomplete, and theme switching. The Companion shortcut appears on other tabs and when AI Insights is hidden in Overview.
- `MarketTicker`: always-on quote strip
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

The desktop shortcut bar and mobile menu offer the same twelve workspaces.

| Key | Workspace | Command |
| --- | --- | --- |
| F1 | Market Overview | `HOME` |
| F2 | News + Geopolitics | `NEWS` |
| F3 | Portfolio | `PORT` |
| F4 | Equity Research | `RESEARCH` |
| F5 | Heatmap | `HEAT` |
| F6 | Macro + Yield Monitor | `MACRO` |
| F7 | Forex | `FX` |
| F8 | ETF Monitor | `ETF` |
| F9 | Crypto | `CRYPTO` |
| F10 | Prediction Markets | `PRED` |
| F11 | Congressional Trades | `CONGRESS` |
| F12 | Settings | `SETTINGS` |

- `HELP` opens **Help & Shortcuts** in Settings. `SETTINGS`, `SETUP`, `CONFIG`, and `AI` open the preferences tab.
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
- GDELT DOC 2.0 and the Global Knowledge Graph archive
  - Supplemental geopolitical story intake and clustering support
- Caldara-Iacoviello GPR dataset
  - Official geopolitical risk time series used by the geopolitics panel

### Other market data

- CoinGecko
  - Crypto prices, rankings, market caps, volume, and breadth inputs
- Polymarket Gamma API
  - Prediction-market contracts, implied probabilities, liquidity, and volume
- U.S. House Clerk, NexusTrade congressional filings and trades, and the congress-legislators registry
  - Congressional transaction disclosures and member identities

### AI-assisted workflows

- OpenAI Responses API
  - Overview summary generation
  - General-purpose companion chat and live web research
  - Optional active-panel and cross-panel analysis
  - Geopolitics event extraction and hotspot summarization
  - Opportunities theme discovery/guidance when AI is enabled

## Workspace inventory

### Market Overview (`HOME`, `OVERVIEW`, `WB`, `WL`)

Choose **Edit layout** to arrange cards as you would in News. Drop a card in the center of another to swap them, or at an edge to place them side by side or one above the other. Drag a divider or corner to resize. You can also remove cards and add them back. **Save layout** keeps the arrangement when Charlie reopens. On narrow screens, cards stack in your saved order.

What it contains:

- Major US index cards
- Sector ETF performance grid
- Big-cap movers
- Cross-asset quotes for commodities and major currencies
- Sentiment regime summary plus underlying sentiment pillars
- Portfolio snapshot
- Watchlist beside the portfolio snapshot, stacking below it on narrow screens, with current quotes, 30-day daily-close charts, and links to equity research
- Prediction-market snapshot
- Upcoming macro calendar
- AI Insights pairs the market summary with the Companion. Type a question or choose a suggested prompt and edit it before sending. GPT-6 Luna is the default model. You can choose another model and set web search to automatic or force a search for the next question. Sending opens the conversation in the side panel. Choose **Open conversation** to return to the chat without sending a question.

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

### Retired Opportunities workspace

Opportunities is removed from current navigation and runtime mounting. Legacy commands return to Overview. A replacement will be proposed separately and requires user approval before implementation.

### Equity Research (`<TICKER>`)

What it contains:

- Quote header and company profile
- Recommendation trends
- Ownership and holder context
- Filings/developments
- Financial statements and ratio-oriented company workbench sections
- For indices, a level quoted in points, 30 days of daily closes, and comparisons with available reference levels. The five major indices on Overview also link to their providers’ descriptions.

Data sources:

- Yahoo Finance for the primary workbench and financial statements
- SEC EDGAR for tagged metrics, linked financial filings, and verified registrant details when Yahoo leaves a field blank
- Teleborsa / FIDA fallback for selected fund-like symbols
- Yahoo quotes for sector ETF comparison

How it is processed:

- The panel fetches a normalized company workbench object plus a separate financials payload
- Company profiles and filings load independently. When the SEC feed has no matching financial tags, the Overview links to an official report or prospectus when available.
- **Refresh** checks Yahoo and EDGAR for updates. On the Financials tab it also refreshes the selected statement period.
- It resolves sector ETF context from the company metadata, then fetches that ETF quote as a lightweight benchmark
- Symbol changes automatically invalidate the relevant research queries

#### Chart view (`<TICKER> GP`, `<TICKER> CHART`)

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

### News + Geopolitics (`NEWS`, `TOP`, `GEO`, `GEOPOL`, `GEOPOLITICS`, `WORLD`)

What it contains:

- General market or ticker-specific headlines
- Topic shortcuts
- Geographic filters
- Search/archive mode
- Compact and extended display modes
- Official geopolitical risk cards and chart
- Global event map with a loading indicator above it, an estimated-impact legend, and linked country hotspots below it
- Live media player that carries its sound setting across channel changes, and a saved, editable card layout

Data sources:

- Yahoo Finance news/search endpoints
- Caldara-Iacoviello GPR dataset
- GDELT DOC 2.0 and the Global Knowledge Graph archive
- OpenAI for event extraction and summarization

How it is processed:

- The top news section still switches between ticker mode and topic-feed mode depending on navigation state
- Topic feeds can combine several related Yahoo queries, then deduplicate the result set
- Visible market and ticker feeds check Yahoo every minute. The wider GEO search checks Yahoo and GDELT every five minutes. New reports appear at the top or wait behind a “Show new headlines” button while the reader is scrolled down.
- The headline bar below the price ticker shares the All/World feed. New stories and highlights enter between headlines. Hovering or focusing a headline holds the desktop scroll. On mobile and with reduced motion, headlines scroll manually.
- Recent material announcements from official sources and developing stories reported by multiple publishers can appear above the headlines. GDELT timestamps describe indexing. Alerts use publisher-dated reports and link to their sources.
- Archive search narrows the feed by topic, lookback window, and region before display
- Mixed headlines are ingested and deduplicated into a common `NewsItem` shape
- OpenAI identifies and scores events in the collected headlines. Charlie groups reviewed incidents into country hotspots.
- The risk index is fetched separately from the official dataset and shown alongside the event map
- The map requires an OpenAI connection. When a review is incomplete, it can reuse recent AI assessments for the same reports and shows the review status.

### Prediction Markets (`PRED`, `PMKT`, `POLY`, `PREDICTIONS`, `POLYMARKET`)

What it contains:

- Forecast cards
- Quoted YES/NO prices, 24-hour changes in percentage points, liquidity, and dollar trading volume
- Leading choices side by side for Polymarket events with mutually exclusive outcomes
- Theme/category context

Data sources:

- Polymarket Gamma API

How it is processed:

- Charlie fetches open events in batches of up to 120, ordered by daily trading volume. Within each batch it gives precedence to contested, actively traded events, covers different topics and limits repeated series when alternatives are available. If either side of a binary question, or the favourite in a single-winner event, reaches 95%, the event is featured after more open ones.
- Predictions initially displays 12 cards. Show more reveals the remaining eligible events. Load more continues through Polymarket’s catalogue, appending distinct events. The opening view refreshes every two minutes. While browsing additional results, Refresh updates the loaded pages.
- A binary card uses that contract’s own trading figures. For single-winner events, the card shows the highest quoted YES prices and labels event-wide activity separately. Missing data appears as a dash.
- The same normalized forecast objects are reused in the Overview and Predictions panels

### Macro + Yield (`MACRO`, `ECO`, `ECON`, `YIELD`, `WIRP`, `BYFC`)

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

### Portfolio (`PORT`, `PORTFOLIO`)

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

### Heatmap (`HEAT`, `MAP`, `SPX`)

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

### Forex (`FX`, `FXIP`, `FOREX`)

What it contains:

- Custom FX pair monitor
- Conversion helpers
- Quick performance read across the saved pair set

Data sources:

- Yahoo Finance forex quotes

How it is processed:

- Stored user pair strings are normalized to a strict `AAA/BBB` format
- Those pairs are translated into quote symbols, fetched together, and normalized back into FX-centric display rows

### Crypto (`CRYPTO`, `XBT`, `BTC`)

What it contains:

- Breadth/rank table
- Leaderboard-style market view
- Price, market cap, volume, and 24-hour move context

Data sources:

- CoinGecko

How it is processed:

- The panel requests a ranked asset list in USD terms
- Returned assets are displayed mostly as-is, with lightweight sorting and formatting in the UI

### ETF Monitor (`ETF`, `ETFS`)

What it contains:

- Curated ETF tables across sectors, fixed income, commodities, and international exposures
- Quick comparative performance view

Data sources:

- Yahoo Finance quotes

How it is processed:

- The panel uses a fixed ETF universe grouped into strategy buckets
- Quotes are fetched in one batch, then sliced into category tables

### Congressional Trades (`CONGRESS`)

Browse House and Senate transaction disclosures by filing date. Filter by member, ticker, or chamber, open a member’s disclosed trades, or select a ticker to research the security in Equity. Each transaction links to its original filing when available.

### Settings (`SETTINGS`, `SETUP`, `CONFIG`, `AI`)

Choose **Help & Shortcuts** or enter `HELP` to see command examples, the workspace directory, keyboard shortcuts, data sources, and international ticker suffixes.

Open **Settings** (F12) to see which optional provider keys are saved on this device. Expand OpenAI, FRED, or Finnhub to add, replace, or remove its key. The status reports local key storage. It does not test the provider account.

The Overview summary has its own model selector and expandable instructions. Model and prompt preferences are saved separately from API keys.

## Non-panel areas that change panel behavior

### Right-side news rail

- Usually visible on desktop
- Hidden when the active workspace already needs more room, such as `news`, `geopolitics`, `predictions`, and `congress`

### Panel companion

- Answers general questions independently of the current Charlie workspace
- Uses the displayed data for chart questions, general knowledge for definitions, and web research for ticker outlooks, recent news, and upcoming events. A question can use both the workspace and current sources. Force Web requests a search for the next answer.
- Offers three reasoning models. Fast (GPT-6 Luna) is the default, Balanced (GPT-6.2 Sol) uses medium reasoning, and Expert (GPT-6.2 Astra) uses high reasoning.
- Places model selection and web-search mode inside the message composer
- The current view is available as background. Refer to a panel by name or type `@` to include additional workspace data. Asking for a stock prediction researches that security.
- Panel context uses visible text and supplements it with structured snapshots fetched through React Query
- Stores up to 30 recent conversations locally, capped at 60 messages per conversation
- Expands from the side companion into a dedicated full-page workspace without resetting the active conversation, draft, model, web mode, panel mentions, or history view

## Current implementation notes

- `YieldPanel.tsx` still exists in the codebase, but user navigation routes yield aliases to the macro panel
- Screener-style command aliases still parse, but no screener workspace is mounted

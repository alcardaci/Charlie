# Charlie

Charlie is a local-first desktop market workspace built with React, Vite, and Electron. It runs as a native app on macOS, Windows, and Linux, and keeps your workspace data, preferences, watchlists, and provider connections local to the machine you are using.

## Current Feature Set

- Command-driven terminal UI with a top command bar, live market ticker, watchlist sidebar, main panel, status bar, and optional live player.
- Dedicated workspaces for market overview, ticker research, charts, news and geopolitics, opportunities, prediction markets, macro and yield monitoring, portfolio tracking, sector heatmaps, forex, crypto, ETF monitoring, help, and settings.
- Fast ticker shortcuts such as `AAPL`, `AAPL GP`, `AAPL NEWS`, and `AAPL WL`.
- Optional AI-assisted market summaries, geopolitics extraction, and panel companion chat.
- Local persistence for watchlists, portfolio lots, command history, chart style, forex pair selection, and provider settings.

## Install and Run

```bash
npm install
npm run desktop:dev
```

On macOS, if the local Electron cache needs to be refreshed:

```bash
npm run fix:electron-mac
npm run desktop:dev
```

## How to Use Charlie

- `HOME` or `OVERVIEW` opens the market overview.
- Typing a ticker such as `AAPL` opens the equity workspace.
- Appending a subcommand changes the destination:
  - `AAPL GP` or `AAPL CHART` opens the chart workspace
  - `AAPL NEWS` opens ticker-specific news
  - `AAPL WL` adds the symbol to the watchlist
- `OPPS`, `NEWS`, `GEO`, `PRED`, `MACRO`, `PORT`, `HEAT`, `FX`, `CRYPTO`, `ETF`, `HELP`, and `SETTINGS` jump straight to the matching workspace.
- `ENTER` runs the command, `UP` and `DOWN` browse command history, `TAB` accepts autocomplete, and `ESC` clears or closes the command dropdown.
- `F1` through `F12` provide shortcut-bar navigation for the core workspaces.

## Data Sources

- Yahoo Finance via `yahoo-finance2`: equities, ETFs, indices, forex, futures, company fundamentals, search, charts, news, portfolio repricing, and most market screens.
- Teleborsa / FIDA fallback parsing: quote and chart fallback for some fund-like instruments that Yahoo does not cover reliably.
- CoinGecko: crypto prices, rankings, market caps, and breadth inputs.
- Polymarket Gamma API: prediction-market contracts, probabilities, liquidity, and volume.
- FRED: macro series and release dates used in the macro and calendar views.
- Finnhub: earnings calendar support used in macro views.
- GDELT DOC 2.0: geopolitics headline intake and country clustering.
- Caldara-Iacoviello GPR dataset: geopolitical risk time series and charting.
- Local policy calendar registry: bundled policy-event schedule data.
- OpenAI Responses API: optional overview summaries, panel companion chat, geopolitics extraction, and opportunities theme discovery.

## Provider Connections

Charlie works with public/no-key sources out of the box. Optional provider credentials are configured in the `SETTINGS` workspace, not in `.env`, and that workspace also lets you adjust the OpenAI model and prompts used by the AI workflows.

- OpenAI: optional AI features
- FRED: macro data and release calendars
- Finnhub: earnings calendar support

On macOS, these credentials are stored in Keychain. On Windows and Linux, they are stored in a local `connections.json` file in the user's Charlie data directory. No private provider keys should be committed to the repository.

## Build Desktop Artifacts

Build the desktop app for the current operating system:

```bash
npm run build:desktop
```

Create shareable packaged artifacts:

```bash
npm run dist:desktop
```

Expected outputs:

- macOS: `release/Charlie.app`, plus `.zip` and `.dmg` from `dist:desktop`
- Windows: unpacked app from `build:desktop`, plus installer and portable `.exe` from `dist:desktop`
- Linux: unpacked app from `build:desktop`, plus `AppImage` and `.tar.gz` from `dist:desktop`

Build on the native OS for the most reliable results.

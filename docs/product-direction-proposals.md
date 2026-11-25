# Charlie: proposed direction after stabilization

Proposals for review, not implemented features. 14 November 2026.

## Product direction

Make Charlie a dependable personal market-research workspace organized around three questions: what changed, why does it matter for assets I follow, and what evidence should I check next? Prefer a few connected workflows over more disconnected panels. Keep public/free market and economic inputs; use the existing paid OpenAI connection for cited synthesis and research assistance.

## Suggested order

1. **Evidence and data health first.** One consistent source/observation-time/checked-time/coverage vocabulary across panels; a small provider-health view; measurable load and failure budgets. Replace stale international macro contracts with current official series where definitions and geography match. A fresh HTTP response must not make an old observation look current.
2. **Watchlist and portfolio research workflow.** A saved research brief per followed asset: price context, new filings, financial changes, relevant dated macro releases and linked news. Show changes since the previous visit and let the user open the original source. Keep valuation, cash flows and price return separate; add properly specified performance accounting only as a distinct project.
3. **Focused macro and sector context.** Add a small number of validated fiscal, real-economy and energy series only when each answers a named research question. Avoid turning every available series into another chart.
4. **A new Opportunities workspace built from scratch.** A queue of research hypotheses with explicit evidence and uncertainty, rather than an opaque ranking of things to buy. Each candidate should include: the observed change; dated independent sources; plausible mechanism; relevant industries/assets with a reason for linkage; a potential catalyst; what would weaken the hypothesis; and a concrete research follow-up. OpenAI can summarize or propose hypotheses, while eligibility and evidence links remain inspectable. Evaluate false positives, unsupported company links, stability and usefulness on a held-out example set before shipping. Alerts/notifications and continuous AI scanning would require a separate usage-budget decision.

## Public-data candidates to validate before approval

| Candidate | Possible user value | Boundary to resolve first |
| --- | --- | --- |
| Treasury Fiscal Data | Fiscal/debt composition and financing context around rates | Official public datasets exist; documentation access returned403 during this pass. Validate endpoint, refresh cadence and exact field definitions before promising an integration. [Treasury public-debt report](https://fiscaldata.treasury.gov/static-data/published-reports/mspd-entire/MonthlyStatementPublicDebt_Entire_202507.pdf) |
| BEA | Explain GDP/consumption/income changes with source components instead of headline-only readings | Select a bounded dataset and transformation; API access requires registration. [BEA API guide](https://apps.bea.gov/API/docs/) |
| EIA | Connect energy inventories, production and electricity conditions to sector research | API uses a free registered key and throttling; select a few useful series rather than indiscriminate ingestion. [EIA open data](https://www.eia.gov/opendata/), [API documentation](https://www.eia.gov/opendata/documentation.php) |
| Existing SEC / BLS / OECD / Eurostat | More value without another vendor: filings deltas and better macro definitions/freshness | Validate coverage, units, revisions and observation dates per series; no inferred replacement for unavailable contracts. |

These are recommendations about product design, not implementation commitments. Review the stabilized app first, then choose one coherent milestone and its success criteria before any broader feature work.

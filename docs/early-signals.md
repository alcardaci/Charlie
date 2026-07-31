# Early Signals methodology

Early Signals is the third Opportunities view. It is designed for uncertain, potentially structural developments over roughly 6–36 months. It is intentionally separate from:

- Discovered Themes, which clusters current cross-market co-occurrence.
- Topic Research, which starts with a topic chosen by the user.

## Phase-one data and storage

The view queries Charlie's existing Yahoo Finance news-search path only after the user opens Early Signals or explicitly refreshes it. It makes no OpenAI request. Each retained observation records the canonical URL, headline, available snippet, publisher-derived independent-source key, publication time, local observation time, matched structural terms, and explicit tickers supplied by the feed.

Exact URL duplicates and same-publisher/day headline duplicates are removed. Retained evidence is pruned to 365 days and capped at 1,200 observations. History is stored in browser local storage and mirrored through Charlie's existing local-state route so it remains local to the installation.

## Detection and calibration

Phase one monitors a small explicit taxonomy of structural candidates. Each candidate requires all of its semantic term groups to occur in the same article. The engine then compares:

- Recent rate: evidence in the latest 30 days.
- Baseline rate: evidence in up to the prior 150 days.
- Acceleration: recent daily rate divided by the baseline daily rate, with smoothing and a cap.
- Novelty: new matched structural indicators plus the scarcity of the prior rate.
- Persistence: distinct active weeks in the recent window.
- Breadth: independently identified publishers.

A candidate is suppressed unless it has at least three recent observations, two independent publishers, multiple publication days, and two active weeks. A normal candidate also needs a usable baseline and at least 1.25× acceleration. During a cold start, the baseline requirement is replaced by a stricter six-observation, four-publisher, three-day gate, and uncertainty remains high.

Evidence grades and uncertainty are rule-based. The ranking score is a relative research priority, not a probability, forecast, or investment recommendation.

## Asset-linkage guardrails

Value-chain roles are defined before companies. A company appears only when:

1. it belongs to a role already mapped to the structural candidate;
2. the company name or ticker is explicitly present in the candidate's evidence; and
3. at least two articles from two independent publishers support it.

If that rule is not met, the role remains visible without a company. Arbitrary feed tickers are never promoted into the beneficiary list.

## Deliberate deferrals

- No paid historical-news backfill. The baseline improves as the local installation observes evidence.
- No generative label discovery or narrative enrichment. This keeps labels coherent and the first release auditable, but limits coverage to the explicit taxonomy.
- No account-level or cross-device history synchronization.
- No source-family graph for identifying syndicated articles that use different URLs and publisher labels; phase one uses exact URL and same-publisher/day headline deduplication.
- No price-return or fundamental-outcome validation yet. Offline fixtures cover extraction, deduplication, ranking gates, uncertainty, and company-linkage rules; forward performance needs a later labeled evaluation set.

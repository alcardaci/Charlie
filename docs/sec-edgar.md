# SEC EDGAR data boundary

Charlie’s Phase 0–1 SEC enrichment is available only through the local server boundary at `/api/sec/company/:ticker`. The browser never calls `data.sec.gov` or `www.sec.gov` directly.

The proxy resolves a ticker only through the SEC company ticker mapping, pads the verified CIK, and then reads official submissions metadata and selected XBRL company facts. It keeps Yahoo market and fundamental data separate and does not require credentials.

The Equity view uses the SEC registrant record to fill available gaps in industry, business address and website, and links to the source when it does. If Company Facts has no matching financial tags, the metrics card links to the issuer’s financial report or prospectus when available. It can also link directly to financial statements attached as an exhibit. An SEC service outage has its own message.

The Equity **Refresh** button rechecks the upstream data even while Charlie’s caches are fresh. A successful response replaces the cached result for later visits.

## User-Agent

SEC fair-access requests should identify the client. Local operation uses this safe default when no setting is provided:

```text
Charlie/1.0 (SEC EDGAR data client)
```

For a shared or published deployment, set a monitored contact in the server environment without committing it to source control:

```bash
SEC_USER_AGENT='Charlie/1.0 (your-team@example.com)'
```

The proxy is intentionally conservative: two concurrent SEC requests, at least 300 ms between requests, a bounded 2.5 second upstream timeout, and retries only for 408, 425, 429, 500, 502, 503, and 504 responses. Caches are schema-versioned: verified ticker identity for 24 hours, submissions for 8 minutes with stale-while-revalidate, and facts for 12 hours with stale-while-revalidate.

TTM requires four consecutive calendar-quarter frames, takes the latest filed revision per frame, and retains the full period start. A newer reported period takes precedence over an older derived TTM. YTD durations are not labeled standalone quarters. Long-term debt (and finance leases when applicable) is derived only from matched current/noncurrent components in the same filing and unit; incomplete components remain unavailable rather than being called total debt.

Opportunities keeps SEC evidence out of initial theme discovery and ranking. Only the existing guidance pass receives bounded, projected SEC facts and official filing links for already-selected linked companies. No extra model call is added.

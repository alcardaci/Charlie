# SEC EDGAR data boundary

Charlie’s Phase 0–1 SEC enrichment is available only through the local server boundary at `/api/sec/company/:ticker`. The browser never calls `data.sec.gov` or `www.sec.gov` directly.

The proxy resolves a ticker only through the SEC company ticker mapping, pads the verified CIK, and then reads official submissions metadata and selected XBRL company facts. It keeps Yahoo market and fundamental data separate and does not require credentials.

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

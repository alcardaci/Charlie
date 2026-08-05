# BLS Macro data

Charlie reads a bounded US national set through the local `/api/bls/timeseries/data/` proxy. The browser never calls the Bureau of Labor Statistics API directly.

The initial set is deliberately local: nonfarm employment (`CES0000000001`) and average hourly earnings (`CES0500000003`). They appear in a compact US local-detail section after the homogeneous OECD activity-and-labour section. Unemployment and inflation remain in the existing core charts, so BLS does not repeat them in a second snapshot.

The proxy uses the public BLS API v1 by default, so no key or account is required. It sends at most 25 series over a bounded three-year window, caches successful responses for 30 minutes, serves stale responses for up to six hours while refreshing, times out upstream requests after 3.5 seconds, and retries selected transient statuses once. Set `BLS_API_KEY` only in the local/server environment if a registered BLS API v2 key is available; this is optional and not committed.

Official documentation: [BLS Public Data API](https://www.bls.gov/developers/home.htm), [API FAQ](https://www.bls.gov/developers/api_faqs.htm), and [API v2 signatures](https://www.bls.gov/developers/api_signature_v2.htm).

# BLS Macro data

Charlie reads a bounded US national set through the local `/api/bls/timeseries/data/` proxy. The browser never calls the Bureau of Labor Statistics API directly.

The bounded US local-detail set uses 15 exact series: nonfarm employment and average hourly earnings; JOLTS job-openings, quits, and layoffs/discharges rates; average weekly hours; the quarterly Employment Cost Index; quarterly productivity and unit labour costs; import/export price indexes transformed to year-over-year percent changes; and construction, manufacturing, information, and financial-activities payrolls. Related series share compact trend groups. Unemployment and consumer inflation remain in the existing core charts, so BLS does not repeat them.

The proxy uses the public BLS API v1 by default, so no key or account is required. It sends 15 series over a bounded four-calendar-year window, below the public 25-series request limit. Successful responses are cached for 30 minutes and may be served stale for up to six hours while refreshing; upstream requests time out after 3.5 seconds and retry selected transient statuses once. Set `BLS_API_KEY` only in the local/server environment if a registered BLS API v2 key is available; this is optional and not committed.

Official documentation: [BLS Public Data API](https://www.bls.gov/developers/home.htm), [API FAQ](https://www.bls.gov/developers/api_faqs.htm), and [API v2 signatures](https://www.bls.gov/developers/api_signature_v2.htm).

# Global Event Map Explainer

This document explains how the global geopolitical event map is populated in the current codebase, where the news comes from, how the model classifies each item, and which filters can reduce the final number of events.

## 1. Source Of News

The map does not read all available news on the internet. It starts from a geopolitics-specific keyword basket in `src/api/finance.ts` and uses that to query two upstream sources:

- Yahoo Finance search
- GDELT DOC 2.0

The intake step is intentionally broader than the final map. Headlines from both sources are normalized into the same `NewsItem` shape, merged together, deduplicated across both sources, filtered to the selected time window, and then capped by timeframe. That means the map is no longer dependent on Yahoo alone, but it is still a keyword-driven funnel rather than a complete real-time firehose.

## 2. How The AI Classifies Headlines

Each accepted candidate headline is sent to the OpenAI geopolitics classifier route with headline-level metadata plus any deterministic geography hints already attached upstream:

- `title`
- `publisher`
- `link`
- `publishedAt`
- `feedSource`
- `locationLabel`
- `countryCodes`

The model used for this classification is `gpt-4.1-mini`. The system prompt tells it to keep only concrete geopolitical or state-security events, exclude commentary and market reactions, and return strict JSON.

For each headline the model is expected to produce:

- `locationLabel`: a human-readable place or country label
- `countryCodes`: up to 3 supported country codes
- `severityScore`: a score from 1 to 10
- `eventKey`: a stable slug for the specific incident
- `eventLabel`: a short neutral description of the event

The severity scale is grouped into four bins:

- `1-2` = `LOW`
- `3-5` = `MEDIUM`
- `6-8` = `HIGH`
- `9-10` = `SEVERE`

The model still does not read the full article, so it has to infer geography and severity from limited context, but the deterministic source/location hints improve recall for GDELT items that already arrive with usable country metadata.

## 3. Deduplication And Clustering

There are two important dedupe stages.

First, obvious article duplication is removed before the AI output is applied. This happens across the combined Yahoo + GDELT intake, not inside each source separately. The pre-AI dedupe uses canonical links and near-identical normalized titles so the same syndicated article is less likely to be sent to the model twice just because it arrived through two different feeds.

Second, after the AI classifies the headlines, the app clusters similar items into distinct events. This is what keeps the map from showing several near-identical headlines as separate geopolitical incidents. The clustering tries to group headlines that appear to describe the same underlying event, while still leaving separate incidents apart when they are actually different.

This means the final map count is closer to “distinct geopolitical events” than to “number of news articles.” If five outlets report the same strike, the map should ideally show one event cluster rather than five separate ones.

## 4. How Country Hotspots Are Built

After classification and clustering, the app groups events by country.

Each country hotspot is built from the clustered event list that belongs to that country. The country count is the number of distinct clustered events tied to that country, not the raw article total. The displayed severity for a country is derived from the strongest event attached to that country.

That is why the map can show a country with several articles but only a smaller number of actual events.

## 5. Caching And Freshness

The geopolitics dataset is cached for 15 minutes in memory and in browser storage. The panel also refreshes on a 15-minute cadence.

That design reduces repeated Yahoo and OpenAI calls when the user switches panels or refreshes frequently, but it also means the map may not update immediately if a new headline arrives inside the cache window.

## 6. Limitations

There are a few important limitations to keep in mind:

- The model only reads headline-level metadata, not full stories.
- The intake is still keyword-driven, so coverage is only as broad as the query terms we ask for.
- The pipeline is conservative and can drop ambiguous headlines.
- A post-AI sanity filter removes obvious non-geopolitical items such as commentary, earnings, and market reaction headlines.
- Country mapping is limited to supported country codes and aliases.
- Clustering is intentionally conservative, but it can still merge two headlines that are related but not actually the same event.
- The 15-minute cache can make the system feel slightly stale during active news bursts.

## 7. Mental Model

The simplest way to think about the pipeline is:

1. Search Yahoo and GDELT with geopolitical keywords.
2. Normalize, merge, and dedupe the resulting headlines across both sources.
3. Ask `gpt-4.1-mini` to decide whether each headline is a real geopolitical event, where it happened, and how severe it is.
4. Normalize the model output into supported countries and a 1-10 severity score.
5. Cluster near-duplicate headlines into a single event.
6. Aggregate the clustered events into country hotspots and the global event map.

That is the full path from incoming news headlines to the map you see in the geopolitics panel.

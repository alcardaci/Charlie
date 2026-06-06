import type { MutableRefObject, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { Globe2, Loader2, Minus, Plus, RefreshCw, Zap } from 'lucide-react';
import type { CountryNewsCount, GeopoliticalScanStatus, NewsItem } from '../types';
import worldCountries110m from '../data/worldCountries110m.json';
import { fmt } from '../utils/formatters';

const GEO_DATA = worldCountries110m;
// ISO 3166-1 alpha-2 → numeric (world-atlas TopoJSON IDs)
const ISO2_TO_NUM: Record<string, number> = {
  US: 840, CA: 124, MX: 484, BR: 76,  AR: 32,
  GB: 826, FR: 250, DE: 276, IT: 380, ES: 724, SE: 752,
  UA: 804, RU: 643, BY: 112, TR: 792,
  IR: 364, IQ: 368, SY: 760, LB: 422, YE: 887, SA: 682,
  AE: 784, IL: 376, EG: 818, SD: 729, ET: 231, ZA: 710, NG: 566,
  AF: 4,   PK: 586, IN: 356, CN: 156, TW: 158, JP: 392,
  KR: 410, MM: 104, VN: 704, SG: 702, ID: 360, PH: 608, AU: 36,
};

interface RegionalNewsMapProps {
  countryData: CountryNewsCount[];
  topicLabel: string;
  timeframeLabel: string;
  timeframeOptions: Array<{ key: string; label: string }>;
  activeTimeframeKey: string;
  onTimeframeChange: (key: string) => void;
  onCountrySelect?: (countryKey: string) => void;
  showDebugSources?: boolean;
  isRefreshing?: boolean;
  isLoading?: boolean;
  scanStatus?: GeopoliticalScanStatus;
  scanStatusLabel?: string;
  scanProgressLabel?: string;
  showHotspotsSection?: boolean;
  headerActions?: ReactNode;
}

type ZoomMoveEvent = {
  zoom: number;
  coordinates: [number, number] | number[];
};

type MapGeography = {
  id: string | number;
  rsmKey: string;
};

// Geographic centroids [lng, lat] for each monitored country (ISO 3166-1 alpha-2)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [ -98.6,  39.5], CA: [ -96.8,  60.0], MX: [-102.0,  24.0],
  BR: [ -51.9, -14.2], AR: [ -63.6, -38.4],
  GB: [  -1.2,  52.4], FR: [   2.2,  46.2], DE: [  10.4,  51.2],
  IT: [  12.6,  42.5], ES: [  -3.7,  40.2], SE: [  15.0,  62.0],
  UA: [  31.2,  49.0], RU: [ 105.3,  61.5], BY: [  28.1,  53.7],
  TR: [  35.2,  39.0],
  IR: [  53.7,  32.4], IQ: [  43.7,  33.2], SY: [  38.3,  34.8],
  LB: [  35.9,  33.9], YE: [  48.5,  15.6], SA: [  45.1,  23.9],
  AE: [  53.8,  23.4], IL: [  34.8,  31.5], EG: [  30.8,  26.8],
  SD: [  30.0,  12.9], ET: [  40.5,   9.1], ZA: [  25.1, -29.0],
  NG: [   8.7,   9.1],
  AF: [  67.7,  33.9], PK: [  69.3,  30.4], IN: [  78.7,  20.6],
  CN: [ 104.2,  35.9], TW: [ 120.9,  23.7], JP: [ 138.0,  36.2],
  KR: [ 127.8,  36.5], MM: [  96.0,  19.0], VN: [ 108.3,  16.1],
  SG: [ 103.8,   1.4], ID: [ 113.9,  -0.8], PH: [ 122.9,  12.9],
  AU: [ 133.8, -25.3],
};

function countryCoords(countryCode: string, x: number, y: number): [number, number] {
  const c = COUNTRY_CENTROIDS[countryCode.toUpperCase()];
  if (c) return c;
  // Fallback: equirectangular approximation from old SVG space
  return [-171 + (x / 2370) * 361, 84 - (y / 1200) * 142];
}

function interpolateColor(start: [number, number, number], end: [number, number, number], weight: number): [number, number, number] {
  return [
    Math.round(start[0] + (end[0] - start[0]) * weight),
    Math.round(start[1] + (end[1] - start[1]) * weight),
    Math.round(start[2] + (end[2] - start[2]) * weight),
  ];
}

function getSeverityRgb(score: number, maxScore: number): [number, number, number] {
  if (score <= 0 || maxScore <= 0) return [13, 17, 23];

  const norm = Math.min(1, score / maxScore);
  const low: [number, number, number] = [250, 204, 21];
  const mid: [number, number, number] = [249, 115, 22];
  const high: [number, number, number] = [127, 29, 29];

  if (norm < 0.55) {
    return interpolateColor(low, mid, norm / 0.55);
  }

  return interpolateColor(mid, high, (norm - 0.55) / 0.45);
}

function getCountryFill(score: number, maxScore: number): string {
  if (score <= 0 || maxScore <= 0) return '#0d1117';
  const [r, g, b] = getSeverityRgb(score, maxScore);
  const alpha = (0.62 + Math.min(1, score / maxScore) * 0.24).toFixed(2);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getHoverFill(score: number, maxScore: number): string {
  if (score <= 0 || maxScore <= 0) return '#1a2535';
  const [r, g, b] = getSeverityRgb(score, maxScore);
  return `rgba(${Math.min(255, r + 14)},${Math.min(255, g + 10)},${Math.min(255, b + 10)},0.98)`;
}

type SeverityLevel = 'low' | 'medium' | 'high' | 'severe';

const SEVERITY_CHIP: Record<SeverityLevel, { bg: string; border: string; text: string; label: string }> = {
  low:    { bg: 'rgba(92,50,6,0.76)',   border: '#facc15', text: '#fde68a', label: 'LOW' },
  medium: { bg: 'rgba(120,53,15,0.82)', border: '#fb923c', text: '#fdba74', label: 'MEDIUM' },
  high:   { bg: 'rgba(127,29,29,0.82)', border: '#ef4444', text: '#fca5a5', label: 'HIGH' },
  severe: { bg: 'rgba(69,10,10,0.88)',  border: '#b91c1c', text: '#fecaca', label: 'SEVERE' },
};

function getSeverity(score: number): SeverityLevel {
  const roundedScore = Math.max(1, Math.min(10, Math.round(score)));
  if (roundedScore >= 9) return 'severe';
  if (roundedScore >= 6) return 'high';
  if (roundedScore >= 3) return 'medium';
  return 'low';
}

function formatUtcTimestamp() {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  }).format(new Date()).replace(',', '').toUpperCase() + ' UTC';
}

type SummarySourceEntry = {
  key: string;
  label: string;
  link: string | null;
};

function canonicalizeSourceLink(rawLink: string): string | null {
  if (!/^https?:\/\//i.test(rawLink.trim())) return null;

  try {
    const parsed = new URL(rawLink.trim());
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeSourceLabel(label: string): string {
  return label
    .replace(/^www\./i, '')
    .trim();
}

function sourceLabelFromStory(story: NewsItem): string {
  const publisher = normalizeSourceLabel(story.publisher ?? '');
  if (publisher) return publisher;

  try {
    const hostname = new URL(story.link).hostname;
    const normalized = normalizeSourceLabel(hostname);
    if (normalized) return normalized;
  } catch {
    // Ignore malformed links and use fallback label.
  }

  return 'Unknown source';
}

function collectSummarySourceEntries(stories: NewsItem[]): SummarySourceEntry[] {
  const seen = new Set<string>();
  const entries: SummarySourceEntry[] = [];

  for (const story of stories) {
    const link = canonicalizeSourceLink(story.link);
    const label = sourceLabelFromStory(story);
    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push({ key: dedupeKey, label, link });
  }

  return entries.slice(0, 6);
}

export function RegionalNewsMap({
  countryData,
  topicLabel,
  timeframeLabel,
  timeframeOptions,
  activeTimeframeKey,
  onTimeframeChange,
  onCountrySelect,
  showDebugSources = false,
  isRefreshing = false,
  isLoading = false,
  scanStatus = 'idle',
  scanStatusLabel,
  scanProgressLabel,
  showHotspotsSection = true,
  headerActions,
}: RegionalNewsMapProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.1);
  const [center, setCenter] = useState<[number, number]>([12, 20]);
  const hotspotRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeCountries = [...countryData]
    .filter((c) => c.count > 0)
    .sort((a, b) => {
      const severityDiff = (b.severityScore ?? 0) - (a.severityScore ?? 0);
      if (severityDiff !== 0) return severityDiff;
      if (b.count !== a.count) return b.count - a.count;
      return (b.latestAt ?? 0) - (a.latestAt ?? 0);
    });

  const totalEvents = new Set(
    activeCountries.flatMap((c) => (c.stories ?? []).map((s) => s.link))
  ).size;
  const liveStamp = formatUtcTimestamp();
  const isGeoView = topicLabel.trim().toLowerCase().includes('geo');
  const eventLabel = isGeoView ? 'EVENTS' : 'STORIES';

  const sourceCounts = [...(activeCountries.length ? activeCountries : countryData)].reduce(
    (acc, c) => { acc.set(c.source, (acc.get(c.source) ?? 0) + Math.max(c.count, 1)); return acc; },
    new Map<string, number>()
  );
  const primarySource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const pipelineSourcesText = (activeCountries.length ? activeCountries : countryData)
    .map((country) => country.source || '')
    .join(' | ')
    .toUpperCase();
  const activeFeedSources = new Set(
    (activeCountries.length ? activeCountries : countryData)
      .flatMap((country) => (country.stories ?? []).flatMap((story) => story.feedSource ? [story.feedSource] : []))
  );
  const yahooActive = activeFeedSources.has('yahoo-finance') || pipelineSourcesText.includes('YAHOO');
  const gdeltActive = activeFeedSources.has('gdelt') || pipelineSourcesText.includes('GDELT');
  const feedStatusLabel = [
    yahooActive ? 'YAHOO' : null,
    gdeltActive ? 'GDELT' : null,
  ].filter(Boolean).join(' + ') || 'YAHOO ONLY';
  const feedStatusTone = gdeltActive
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-terminal-accent/30 bg-terminal-accent/10 text-terminal-accent';
  const scanStatusTone = scanStatus === 'error'
    ? 'border-terminal-negative/35 bg-terminal-negative/10 text-terminal-negative'
    : scanStatus === 'complete'
      ? 'border-terminal-positive/35 bg-terminal-positive/10 text-terminal-positive'
      : scanStatus === 'partial'
        ? 'border-terminal-accent/35 bg-terminal-accent/10 text-terminal-accent'
        : 'border-terminal-border bg-terminal-hover text-terminal-muted';

  // Build numeric-id → country lookup for Geography coloring
  const countryByNum = new Map<number, CountryNewsCount>();
  for (const c of countryData) {
    const num = ISO2_TO_NUM[c.countryCode.toUpperCase()];
    if (num != null) countryByNum.set(num, c);
  }

  function focusHotspot(key: string) {
    setSelectedKey(key);
    hotspotRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onCountrySelect?.(key);
  }

  // Marker font size: constant screen-space size by dividing by zoom
  // Empirically calibrated: 5.5 → ~5px screen, so ~12.4 → ~11px screen
  const markerFontSize = 12.4 / zoom;
  const markerStroke = 4.0 / zoom;
  const firstLoadWarning = (
    <div className="mx-4 mt-3 rounded border border-terminal-accent/35 bg-terminal-accent/10 px-3 py-2 text-[11px] text-terminal-accent">
      First-time load warning: the global event map can take a little longer while feeds are fetched and hotspots are built.
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel">
        <div className="flex items-center justify-between gap-3 px-4 py-2 panel-border-b bg-terminal-elevated/40">
          <div className="flex items-center gap-2">
            <Globe2 size={14} className="text-terminal-accent" />
            <span className="text-terminal-accent text-sm font-bold tracking-wider">GLOBAL EVENT MAP</span>
          </div>
          <div className="text-[11px] text-terminal-faint">{timeframeLabel}</div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          {firstLoadWarning}
          <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-terminal-border bg-[#050a0e]">
            <Loader2 size={20} className="animate-spin text-terminal-accent" />
            <div className="text-[11px] font-bold tracking-[0.24em] text-terminal-accent">SCANNING GLOBAL FEEDS</div>
            <div className="max-w-xs text-center text-[11px] text-terminal-faint leading-relaxed">
              Pulling live geopolitical headlines and matching them to countries.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 panel-border-b bg-terminal-elevated/40">
        <div className="flex items-center gap-2">
          <Globe2 size={14} className="text-terminal-accent" />
          <span className="text-terminal-accent text-sm font-bold tracking-wider">GLOBAL EVENT MAP</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-terminal-faint">
          <span>{timeframeLabel}</span>
          {scanStatusLabel ? (
            <span className={`rounded border px-2 py-0.5 font-bold tracking-[0.18em] ${scanStatusTone}`}>
              {scanStatusLabel.toUpperCase()}
            </span>
          ) : null}
          {scanProgressLabel ? <span className="text-terminal-faint/70">{scanProgressLabel}</span> : null}
          {showDebugSources && (
            <>
              <span className={`rounded border px-2 py-0.5 font-bold tracking-[0.18em] ${feedStatusTone}`}>
                FEEDS · {feedStatusLabel}
              </span>
              {primarySource ? <span className="text-terminal-faint/70">SOURCE · {primarySource}</span> : null}
            </>
          )}
          <span className="flex items-center gap-1">
            <Zap size={10} className="text-terminal-accent" />
            {totalEvents} {eventLabel}
          </span>
          <span>{activeCountries.length} COUNTRIES</span>
          {headerActions}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {/* ─── Map container ─── */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl"
          style={{ background: '#050a0e' }}
        >
          {isRefreshing && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#050a0e]/46 backdrop-blur-[1.5px]">
              <div className="flex min-w-[220px] items-center gap-3 rounded-lg border border-terminal-accent/35 bg-black/78 px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                <Loader2 size={16} className="animate-spin text-terminal-accent flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-bold tracking-[0.22em] text-terminal-accent">UPDATING MAP</div>
                  <div className="mt-1 text-[11px] text-terminal-faint">
                    Loading {timeframeLabel} geopolitical events and hotspots.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top-left label */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded border border-white/8 bg-black/60 px-2.5 py-1.5 backdrop-blur-sm pointer-events-none">
            <span className="text-[9px] font-bold tracking-[0.28em] text-terminal-text/80">GLOBAL SITUATION</span>
            <span className="text-[9px] tracking-[0.18em] text-terminal-faint/60">
              {isGeoView ? 'GEO EVENT MONITOR' : 'NEWS MONITOR'}
            </span>
          </div>

          {/* Top-right: timestamp + live badge */}
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded border border-white/8 bg-black/60 px-2.5 py-1.5 backdrop-blur-sm pointer-events-none">
            <span className="text-[9px] tracking-[0.18em] text-terminal-faint/70">{liveStamp}</span>
            <span className="flex items-center gap-1 rounded bg-terminal-accent/20 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.2em] text-terminal-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-terminal-accent animate-pulse" />
              LIVE
            </span>
          </div>

          {/* Timeframe selector */}
          <div className="absolute left-3 top-12 z-10 flex items-center gap-0.5 rounded border border-white/8 bg-black/65 p-1 backdrop-blur-sm">
            {timeframeOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => onTimeframeChange(option.key)}
                className={`rounded px-2.5 py-1 text-[9px] font-medium tracking-[0.2em] transition-colors ${
                  option.key === activeTimeframeKey
                    ? 'bg-terminal-accent text-terminal-bg'
                    : 'text-terminal-faint/70 hover:bg-white/6 hover:text-terminal-text'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div className="absolute right-3 top-14 z-10 flex flex-col gap-1">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.5, 8))}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-black/70 text-terminal-faint/70 hover:bg-black/90 hover:text-terminal-text transition-colors backdrop-blur-sm"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.5, 0.8))}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-black/70 text-terminal-faint/70 hover:bg-black/90 hover:text-terminal-text transition-colors backdrop-blur-sm"
            >
              <Minus size={12} />
            </button>
            {zoom !== 1.1 && (
              <button
                onClick={() => { setZoom(1.1); setCenter([12, 20]); }}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-black/70 text-terminal-faint/50 hover:text-terminal-text text-[8px] font-bold tracking-tight transition-colors backdrop-blur-sm"
              >
                ⊡
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2.5 rounded border border-white/8 bg-black/65 px-3 py-1.5 backdrop-blur-sm pointer-events-none">
            <span className="text-[9px] font-bold tracking-[0.24em] text-terminal-faint/60">RISK</span>
            {(['low', 'medium', 'high', 'severe'] as SeverityLevel[]).map((level) => {
              const chip = SEVERITY_CHIP[level];
              return (
                <span key={level} className="flex items-center gap-1 text-[9px]" style={{ color: chip.text }}>
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: chip.border, opacity: 0.9 }} />
                  {chip.label}
                </span>
              );
            })}
          </div>

          {/* Active zone count */}
          <div className="absolute bottom-3 right-3 z-10 rounded border border-white/8 bg-black/65 px-3 py-1.5 backdrop-blur-sm text-right pointer-events-none">
            <div className="text-[9px] font-bold tracking-[0.22em] text-terminal-accent">{activeCountries.length} ACTIVE ZONES</div>
            <div className="text-[10px] text-terminal-text tabular-nums">{totalEvents} {eventLabel.toLowerCase()}</div>
          </div>

          {/* ─── Choropleth Map ─── */}
          <ComposableMap
            projection="geoNaturalEarth1"
            projectionConfig={{ scale: 148, center: [12, 15] }}
            style={{ width: '100%', height: '100%' }}
          >
            <ZoomableGroup
              zoom={zoom}
              center={center}
              minZoom={0.8}
              maxZoom={8}
              onMoveEnd={({ zoom: z, coordinates }: ZoomMoveEvent) => {
                setZoom(z);
                setCenter(coordinates as [number, number]);
              }}
            >
              {/* Ocean background */}
              <rect x={-5000} y={-3000} width={10000} height={6000} fill="#050a0e" />

              <Geographies geography={GEO_DATA}>
                {({ geographies }: { geographies: MapGeography[] }) =>
                  geographies.map((geo: MapGeography) => {
                    const numId = Number(geo.id);
                    const data = countryByNum.get(numId);
                    const hasEvents = data != null && data.count > 0;
                    const fill = getCountryFill(data?.severityScore ?? 0, 10);
                    const stroke = hasEvents ? 'rgba(239,68,68,0.3)' : '#1a2535';
                    const hoverFill = getHoverFill(data?.severityScore ?? 0, 10);

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={hasEvents ? 0.7 : 0.35}
                        tabIndex={hasEvents ? 0 : -1}
                        onClick={hasEvents ? () => focusHotspot(data.key) : undefined}
                        style={{
                          default: { fill, stroke, strokeWidth: hasEvents ? 0.7 : 0.35, outline: 'none' },
                          hover: {
                            fill: hoverFill,
                            stroke: hasEvents ? 'rgba(239,68,68,0.55)' : '#1e2d40',
                            strokeWidth: hasEvents ? 0.9 : 0.35,
                            outline: 'none',
                            cursor: hasEvents ? 'pointer' : 'default',
                          },
                          pressed: { fill, outline: 'none' },
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Severity + event labels centered on each active country */}
              {activeCountries.map((country) => {
                const [lng, lat] = countryCoords(country.countryCode, country.x, country.y);
                const isSelected = selectedKey === country.key;
                const severityScore = Math.round(country.severityScore ?? 0);
                const level = getSeverity(severityScore);
                const chip = SEVERITY_CHIP[level];
                const badgeWidth = 34 / zoom;
                const badgeHeight = 24 / zoom;
                const badgeRadius = 3.5 / zoom;
                const pulseDuration = `${Math.max(1.55, 2.45 - Math.min(severityScore, 10) * 0.07).toFixed(2)}s`;
                const basePulseRadius = badgeWidth * 0.82;
                const peakPulseRadius = badgeWidth * 1.48;

                return (
                  <Marker key={country.key} coordinates={[lng, lat]}>
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={() => focusHotspot(country.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          focusHotspot(country.key);
                        }
                      }}
                    >
                      <title>{country.label}: severity {severityScore}, {country.count} {isGeoView ? 'events' : 'stories'}</title>

                      <circle
                        r={basePulseRadius * 0.66}
                        fill={chip.border}
                        opacity={0.12}
                      >
                        <animate attributeName="r" values={`${basePulseRadius * 0.66};${peakPulseRadius * 0.92};${basePulseRadius * 0.66}`} dur={pulseDuration} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.12;0;0.12" dur={pulseDuration} repeatCount="indefinite" />
                      </circle>
                      <circle
                        r={basePulseRadius}
                        fill="none"
                        stroke={chip.border}
                        strokeWidth={0.56 / zoom}
                        opacity={0.52}
                      >
                        <animate attributeName="r" values={`${basePulseRadius};${peakPulseRadius};${basePulseRadius}`} dur={pulseDuration} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.52;0;0.52" dur={pulseDuration} repeatCount="indefinite" />
                      </circle>
                      <circle
                        r={basePulseRadius * 0.84}
                        fill="none"
                        stroke={chip.border}
                        strokeWidth={0.42 / zoom}
                        opacity={0.38}
                      >
                        <animate attributeName="r" values={`${basePulseRadius * 0.84};${peakPulseRadius * 0.92};${basePulseRadius * 0.84}`} dur={pulseDuration} begin={`-${(Number.parseFloat(pulseDuration) / 2).toFixed(2)}s`} repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.38;0;0.38" dur={pulseDuration} begin={`-${(Number.parseFloat(pulseDuration) / 2).toFixed(2)}s`} repeatCount="indefinite" />
                      </circle>

                      {/* Selection ring */}
                      {isSelected && (
                        <circle
                          r={markerFontSize * 2.9}
                          fill="none"
                          stroke="#f0a500"
                          strokeWidth={markerStroke * 0.8}
                          strokeDasharray={`${markerFontSize} ${markerFontSize * 0.5}`}
                        />
                      )}

                      <rect
                        x={-badgeWidth / 2}
                        y={-badgeHeight / 2}
                        width={badgeWidth}
                        height={badgeHeight}
                        rx={badgeRadius}
                        fill="rgba(3,8,12,0.86)"
                        stroke={chip.border}
                        strokeWidth={0.65 / zoom}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        y={-3.2 / zoom}
                        fill={chip.text}
                        fontSize={markerFontSize * 0.76}
                        fontWeight={800}
                        style={{ fontFamily: 'monospace', letterSpacing: '-0.02em', userSelect: 'none' }}
                      >
                        S{severityScore}
                      </text>
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        y={6.1 / zoom}
                        fill="rgba(255,255,255,0.88)"
                        fontSize={markerFontSize * 0.48}
                        fontWeight={700}
                        style={{ fontFamily: 'monospace', letterSpacing: '-0.01em', userSelect: 'none' }}
                      >
                        E{country.count}
                      </text>
                    </g>
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {showHotspotsSection ? (
          <div className="mt-4">
            <CountryHotspotsSection
              countryData={countryData}
              topicLabel={topicLabel}
              selectedKey={selectedKey}
              hotspotRefs={hotspotRefs}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CountryHotspotsSection({
  countryData,
  topicLabel,
  selectedKey = null,
  hotspotRefs,
}: {
  countryData: CountryNewsCount[];
  topicLabel: string;
  selectedKey?: string | null;
  hotspotRefs?: MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const activeCountries = [...countryData]
    .filter((c) => c.count > 0)
    .sort((a, b) => {
      const severityDiff = (b.severityScore ?? 0) - (a.severityScore ?? 0);
      if (severityDiff !== 0) return severityDiff;
      if (b.count !== a.count) return b.count - a.count;
      return (b.latestAt ?? 0) - (a.latestAt ?? 0);
    });
  const isGeoView = topicLabel.trim().toLowerCase().includes('geo');
  const eventLabel = isGeoView ? 'EVENTS' : 'STORIES';

  return (
    <div className="overflow-hidden rounded border border-terminal-border bg-terminal-panel">
      <div className="flex items-center justify-between gap-3 px-4 py-2 panel-border-b bg-terminal-elevated/40">
        <div className="flex items-center gap-2">
          <Globe2 size={14} className="text-terminal-accent" />
          <div className="text-terminal-accent text-sm font-bold tracking-wider">COUNTRY HOTSPOTS</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-terminal-accent tabular-nums">{activeCountries.length}</div>
          <div className="text-[9px] font-bold tracking-[0.18em] text-terminal-faint/60">ACTIVE</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2">
        {activeCountries.length === 0 ? (
          <div className="rounded-lg border border-terminal-border/60 bg-terminal-bg px-4 py-5 text-center text-xs text-terminal-faint xl:col-span-2">
            No country-specific {isGeoView ? 'events' : 'stories'} matched the current topic and timeframe.
          </div>
        ) : (
          activeCountries.map((country) => {
            const severityScore = country.severityScore ?? 0;
            const severityRatio = Math.min(1, Math.max(0, severityScore / 10));
            const level = getSeverity(severityScore);
            const chip = SEVERITY_CHIP[level];
            const fillColor = getCountryFill(severityScore, 10);
            const summarySourceEntries = collectSummarySourceEntries(country.hotspotSummarySources ?? country.stories ?? []);
            const showSummaryLoading = country.hotspotSummaryStatus === 'loading' && !country.hotspotSummary;

            return (
              <div
                key={country.key}
                ref={(node) => {
                  if (hotspotRefs) {
                    hotspotRefs.current[country.key] = node;
                  }
                }}
                className={`rounded-lg border bg-terminal-bg/75 px-3 py-3 scroll-mt-4 transition-all ${
                  selectedKey === country.key
                    ? 'border-terminal-accent/45 shadow-[0_0_18px_rgba(240,165,0,0.08)]'
                    : 'border-terminal-border/70 hover:border-terminal-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex h-2 w-2 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: chip.border, boxShadow: `0 0 8px ${chip.border}` }}
                      />
                      <span className="text-xs font-semibold text-terminal-text">{country.label}</span>
                      <span className="text-[10px] font-bold tracking-[0.16em] text-terminal-faint/60">{country.shortLabel}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em]"
                        style={{ background: chip.bg, border: `1px solid ${chip.border}`, color: chip.text, opacity: 0.9 }}
                      >
                        {chip.label}
                      </span>
                      {country.isPartial ? (
                        <span className="rounded border border-terminal-accent/35 bg-terminal-accent/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.18em] text-terminal-accent">
                          PARTIAL
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[10px] text-terminal-faint/60">
                      {country.latestAt ? fmt.timeAgo(country.latestAt) : `No recent ${isGeoView ? 'events' : 'stories'}`}
                    </div>
                  </div>
                  <div className="flex items-end gap-3 text-right flex-shrink-0">
                    <div>
                      <div className="text-[9px] font-bold tracking-[0.18em] text-terminal-faint/60">SEVERITY</div>
                      <div className="mt-0.5 text-2xl font-bold tabular-nums leading-none" style={{ color: chip.text }}>
                        {Math.round(severityScore)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold tracking-[0.16em] text-terminal-faint/60">{eventLabel}</div>
                      <div className="mt-1 text-sm font-semibold tabular-nums text-terminal-text/85">
                        {country.count}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[9px] font-medium tracking-[0.16em] text-terminal-faint/50 mb-1.5">
                    <span>SEVERITY</span>
                    <span className="tabular-nums">{chip.label} · {Math.round(severityScore)}/10</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-terminal-border/40">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(8, severityRatio * 100)}%`,
                        background: `linear-gradient(90deg, rgba(250,204,21,0.92), ${fillColor})`,
                        boxShadow: `0 0 6px ${chip.border}50`,
                      }}
                    />
                  </div>
                </div>

                {country.hotspotSummary ? (
                  <div className="mt-3 rounded border border-terminal-border/60 bg-terminal-panel/45 px-2.5 py-2.5">
                    <div className="text-[9px] font-bold tracking-[0.18em] text-terminal-faint/55">SUMMARY</div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-terminal-text">
                      {country.hotspotSummary}
                    </p>
                    {summarySourceEntries.length > 0 && (
                      <div className="mt-2 text-[11px] leading-relaxed text-terminal-faint/85">
                        <span className="font-semibold text-terminal-faint/70">Sources:</span>{' '}
                        {summarySourceEntries.map((entry, index) => (
                          <span key={entry.key}>
                            {entry.link ? (
                              <a
                                href={entry.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-terminal-muted hover:text-terminal-accent transition-colors"
                                title={entry.label}
                              >
                                {entry.label}
                              </a>
                            ) : (
                              <span className="text-terminal-faint/80">{entry.label}</span>
                            )}
                            {index < summarySourceEntries.length - 1 ? ', ' : null}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : showSummaryLoading ? (
                  <div className="mt-3 rounded border border-terminal-border/60 bg-terminal-panel/45 px-2.5 py-2.5">
                    <div className="text-[9px] font-bold tracking-[0.18em] text-terminal-faint/55">SUMMARY</div>
                    <div className="mt-1.5 inline-flex items-center gap-2 text-[11px] text-terminal-faint/85">
                      <Loader2 size={12} className="animate-spin text-terminal-accent" />
                      Generating summary...
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

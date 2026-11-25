import type { MutableRefObject, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { Globe2, Minus, Plus, Zap } from 'lucide-react';
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
  AE: 784, IL: 376, PS: 275, EG: 818, SD: 729, ET: 231, ZA: 710, NG: 566,
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
  sourceNote: string;
  archiveMode: boolean;
  analysisNote: string;
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
  AU: [ 133.8, -25.3], PS: [35.2, 31.9],
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

function formatUtcTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  }).format(new Date(timestamp)).replace(',', '').toUpperCase() + ' UTC';
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
  sourceNote,
  archiveMode,
  analysisNote,
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
  const assessmentStamp = formatUtcTimestamp(Math.max(0, ...countryData.map((country) => country.lastClassifiedAt ?? 0)));
  const isGeoView = topicLabel.trim().toLowerCase().includes('geo');
  const eventLabel = isGeoView ? 'EVENTS' : 'STORIES';

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
    const row = hotspotRefs.current[key];
    const list = row?.closest<HTMLElement>('[aria-label="Country hotspots"]');
    if (row && list) {
      list.scrollTo({ top: list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top, behavior: 'smooth' });
    }
    onCountrySelect?.(key);
  }

  // Marker font size: constant screen-space size by dividing by zoom
  // Empirically calibrated: 5.5 → ~5px screen, so ~12.4 → ~11px screen
  const markerFontSize = 12.4 / zoom;
  const markerStroke = 4.0 / zoom;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel">
      {/* ─── Header ─── */}
      <header className="news-card-header">
        <div className="flex items-center gap-2">
          <Globe2 size={14} className="text-terminal-accent" />
          <h2 className="text-terminal-accent text-sm font-bold tracking-wider">GLOBAL EVENT MAP</h2>
        </div>
        {headerActions}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-1 px-3 py-2 text-[10px] text-terminal-muted" role="status">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-terminal-faint">
            {scanStatusLabel && (
              <span className={`rounded border px-2 py-0.5 font-bold tracking-[0.18em] ${scanStatusTone}`}>
                {scanStatusLabel.toUpperCase()}
              </span>
            )}
            {scanProgressLabel && <span className="text-terminal-faint/70">{scanProgressLabel}</span>}
            {showHotspotsSection && (
              <>
                <span className="flex items-center gap-1">
                  <Zap size={10} className="text-terminal-accent" /> {totalEvents} {eventLabel}
                </span>
                <span>{activeCountries.length} COUNTRIES</span>
              </>
            )}
          </div>
          <div>{sourceNote}{archiveMode && <span title="GDELT archive coverage uses indexing times from recent quarter-hour batches."> · recent batches</span>}</div>
          <div>{analysisNote}</div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 px-3 pb-2">
          <div role="group" className="flex gap-0.5" aria-label={`Event lookback, currently ${timeframeLabel}`}>
            {timeframeOptions.map(option => <button key={option.key} type="button" aria-pressed={option.key === activeTimeframeKey}
              onClick={() => onTimeframeChange(option.key)} className={`rounded px-2 py-1 text-[10px] ${option.key === activeTimeframeKey ? 'bg-terminal-accent text-terminal-bg' : 'text-terminal-muted hover:bg-terminal-hover'}`}>{option.label}</button>)}
          </div>
          {assessmentStamp && <time className="text-[10px] text-terminal-faint" title="Last completed review">{assessmentStamp}</time>}
        </div>
        <div className={`relative mx-2 min-h-[8rem] overflow-hidden rounded bg-[#050a0e] ${showHotspotsSection ? 'h-[43%] shrink-0' : 'mb-2 flex-1'}`}>
          {isLoading && <div role="status" className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/75 px-2 py-1 text-[10px] text-terminal-muted">Fetching news feeds…</div>}
          {/* Zoom controls */}
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button
              aria-label="Zoom in event map"
              onClick={() => setZoom((z) => Math.min(z + 0.5, 8))}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-black/70 text-terminal-faint/70 hover:bg-black/90 hover:text-terminal-text transition-colors backdrop-blur-sm"
            >
              <Plus size={12} />
            </button>
            <button
              aria-label="Zoom out event map"
              onClick={() => setZoom((z) => Math.max(z - 0.5, 0.8))}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-black/70 text-terminal-faint/70 hover:bg-black/90 hover:text-terminal-text transition-colors backdrop-blur-sm"
            >
              <Minus size={12} />
            </button>
            {zoom !== 1.1 && (
              <button
                aria-label="Reset event map zoom"
                onClick={() => { setZoom(1.1); setCenter([12, 20]); }}
                className="flex h-7 w-7 items-center justify-center rounded border border-white/12 bg-black/70 text-terminal-faint/50 hover:text-terminal-text text-[8px] font-bold tracking-tight transition-colors backdrop-blur-sm"
              >
                ⊡
              </button>
            )}
          </div>

          {/* Legend */}
          {activeCountries.length > 0 && <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2.5 rounded border border-white/8 bg-black/65 px-3 py-1.5 backdrop-blur-sm pointer-events-none">
            <span className="text-[9px] font-bold tracking-[0.24em] text-terminal-faint/60">AI IMPACT</span>
            {(['low', 'medium', 'high', 'severe'] as SeverityLevel[]).map((level) => {
              const chip = SEVERITY_CHIP[level];
              return (
                <span key={level} className="flex items-center gap-1 text-[9px]" style={{ color: chip.text }}>
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: chip.border, opacity: 0.9 }} />
                  {chip.label}
                </span>
              );
            })}
          </div>}

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
                        role={hasEvents ? 'button' : undefined}
                        aria-label={hasEvents ? `Show hotspots for ${data.label}` : undefined}
                        onKeyDown={hasEvents ? (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusHotspot(data.key); } } : undefined}
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
                      <title>{country.label}, AI-estimated impact {severityScore}/10, {country.count} {isGeoView ? 'events' : 'stories'}</title>

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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Country hotspots">
            <CountryHotspotsSection
              countries={activeCountries}
              isGeoView={isGeoView}
              selectedKey={selectedKey}
              hotspotRefs={hotspotRefs}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}


function CountryHotspotsSection({ countries, isGeoView, selectedKey, hotspotRefs }: {
  countries: CountryNewsCount[];
  isGeoView: boolean;
  selectedKey: string | null;
  hotspotRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const eventName = isGeoView ? 'event' : 'story';
  return (
    <div className="px-3 py-2">
      <h3 className="mb-1 text-[11px] font-bold tracking-wider text-terminal-accent">COUNTRY HOTSPOTS</h3>
      {countries.length === 0 && <p className="py-2 text-xs text-terminal-muted">OpenAI found no country-specific events in the reviewed headlines.</p>}
      {countries.map(country => {
        const score = Math.round(country.severityScore ?? 0);
        const tone = SEVERITY_CHIP[getSeverity(score)];
        const sources = collectSummarySourceEntries(country.hotspotSummary ? country.hotspotSummarySources ?? [] : country.stories ?? []);
        return (
          <div key={country.key} ref={node => { hotspotRefs.current[country.key] = node; }}
            className={`py-2.5 ${selectedKey === country.key ? 'bg-terminal-accent/5' : ''}`}>
            <h4 className={`text-sm font-semibold ${selectedKey === country.key ? 'text-terminal-accent' : 'text-terminal-text'}`}>{country.label}</h4>
            {country.hotspotSummary ? <p className="mt-1 text-xs leading-relaxed text-terminal-text">{country.hotspotSummary}</p>
              : country.hotspotSummaryStatus === 'loading' ? <p className="mt-1 text-xs text-terminal-muted">Preparing summary…</p>
              : country.hotspotSummaryStatus === 'error' ? <p className="mt-1 text-xs text-terminal-muted">Summary unavailable.</p> : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-terminal-muted">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.border }} />
                AI-estimated impact {score}/10</span>
              <span>{country.count} {country.count === 1 ? eventName : isGeoView ? 'events' : 'stories'}</span>
              {!!country.latestAt && <span>{fmt.timeAgo(country.latestAt)}</span>}
              {country.isPartial && <span>Partial coverage</span>}
            </div>
            {sources.length > 0 && <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-terminal-muted">
              <span>Sources</span>
              {sources.map(source => source.link
                ? <a key={source.key} href={source.link} target="_blank" rel="noreferrer" className="underline decoration-terminal-border underline-offset-2 hover:text-terminal-accent">{source.label}</a>
                : <span key={source.key}>{source.label}</span>)}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

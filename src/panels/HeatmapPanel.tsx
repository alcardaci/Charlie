import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, Treemap } from 'recharts';
import { fetchQuotes } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt } from '../utils/formatters';
import { getThemePalette, useTheme } from '../utils/theme';
import { buildHeatmapEntries, heatmapNodeEntry, heatmapQuoteChange, weightedHeatmapChange, type HeatmapEntry, type HeatmapSizeMode } from '../utils/heatmapData';

type SectorGroup = {
  label: string;
  stocks: string[];
};

type SectorConfig = {
  sector: string;
  etf: string;
  colSpan: number;
  rowSpan: number;
  groups: SectorGroup[];
};

type HeatmapTileProps = Partial<HeatmapEntry> & {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  payload?: HeatmapEntry;
};

const SECTOR_CONFIG: SectorConfig[] = [
  {
    sector: 'Technology',
    etf: 'XLK',
    colSpan: 5,
    rowSpan: 4,
    groups: [
      { label: 'Consumer Electronics', stocks: ['AAPL'] },
      { label: 'Software Infrastructure', stocks: ['MSFT', 'ORCL', 'PLTR', 'PANW', 'CRWD', 'FTNT', 'SNPS', 'CDNS'] },
      { label: 'Semiconductors', stocks: ['NVDA', 'AVGO', 'AMD', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ADI', 'INTC'] },
      { label: 'Networking & IT Services', stocks: ['CSCO', 'ANET', 'IBM', 'ACN', 'CRM', 'NOW', 'INTU'] },
    ],
  },
  {
    sector: 'Consumer Cyclical',
    etf: 'XLY',
    colSpan: 3,
    rowSpan: 3,
    groups: [
      { label: 'Internet Retail', stocks: ['AMZN'] },
      { label: 'Auto Manufacturers', stocks: ['TSLA', 'GM', 'F'] },
      { label: 'Home Improvement', stocks: ['HD', 'LOW'] },
      { label: 'Restaurants & Travel', stocks: ['MCD', 'SBUX', 'BKNG', 'RCL', 'ABNB', 'CMG'] },
      { label: 'Apparel & Retail', stocks: ['TJX', 'NKE'] },
    ],
  },
  {
    sector: 'Financial Services',
    etf: 'XLF',
    colSpan: 2,
    rowSpan: 3,
    groups: [
      { label: 'Banks', stocks: ['BRK-B', 'JPM', 'BAC', 'WFC', 'C'] },
      { label: 'Payments', stocks: ['V', 'MA', 'AXP'] },
      { label: 'Capital Markets', stocks: ['GS', 'MS', 'BLK', 'BX', 'SCHW'] },
      { label: 'Data & Insurance', stocks: ['SPGI', 'CME', 'ICE', 'PGR', 'CB'] },
    ],
  },
  {
    sector: 'Consumer Defensive',
    etf: 'XLP',
    colSpan: 2,
    rowSpan: 3,
    groups: [
      { label: 'Retail', stocks: ['WMT', 'COST', 'TGT', 'KR'] },
      { label: 'Household', stocks: ['PG', 'CL', 'KMB'] },
      { label: 'Beverages & Tobacco', stocks: ['KO', 'PEP', 'MDLZ', 'PM', 'MO'] },
    ],
  },
  {
    sector: 'Communication Services',
    etf: 'XLC',
    colSpan: 5,
    rowSpan: 2,
    groups: [
      { label: 'Internet Content', stocks: ['GOOGL', 'META'] },
      { label: 'Entertainment', stocks: ['NFLX', 'DIS', 'WBD'] },
      { label: 'Telecom', stocks: ['TMUS', 'VZ', 'T', 'CMCSA', 'CHTR'] },
    ],
  },
  {
    sector: 'Healthcare',
    etf: 'XLV',
    colSpan: 3,
    rowSpan: 3,
    groups: [
      { label: 'Drug Manufacturers', stocks: ['LLY', 'JNJ', 'ABBV', 'MRK', 'BMY', 'PFE', 'GILD'] },
      { label: 'Managed Care', stocks: ['UNH', 'ELV', 'CI', 'CVS', 'HCA'] },
      { label: 'Medical Devices', stocks: ['ABT', 'SYK', 'BSX', 'MDT', 'ISRG', 'EW'] },
      { label: 'Diagnostics', stocks: ['TMO', 'DHR'] },
    ],
  },
  {
    sector: 'Industrials',
    etf: 'XLI',
    colSpan: 3,
    rowSpan: 3,
    groups: [
      { label: 'Aerospace & Defense', stocks: ['GE', 'RTX', 'LMT', 'BA', 'NOC', 'GD'] },
      { label: 'Industrial Machinery', stocks: ['CAT', 'DE', 'HON', 'ETN', 'PH', 'ITW', 'EMR', 'CMI'] },
      { label: 'Transport & Services', stocks: ['UNP', 'UPS', 'WM', 'CTAS', 'TT', 'JCI'] },
    ],
  },
  {
    sector: 'Basic Materials',
    etf: 'XLB',
    colSpan: 2,
    rowSpan: 2,
    groups: [
      { label: 'Chemicals', stocks: ['LIN', 'APD', 'ECL', 'SHW', 'DD', 'DOW'] },
      { label: 'Metals & Mining', stocks: ['NEM', 'FCX', 'NUE', 'CF', 'MLM'] },
    ],
  },
  {
    sector: 'Energy',
    etf: 'XLE',
    colSpan: 3,
    rowSpan: 2,
    groups: [
      { label: 'Integrated Oil', stocks: ['XOM', 'CVX'] },
      { label: 'Exploration & Production', stocks: ['COP', 'EOG', 'OXY'] },
      { label: 'Refining & Services', stocks: ['SLB', 'MPC', 'PSX', 'VLO', 'HAL', 'KMI', 'WMB'] },
    ],
  },
  {
    sector: 'Utilities',
    etf: 'XLU',
    colSpan: 3,
    rowSpan: 2,
    groups: [
      { label: 'Regulated Electric', stocks: ['NEE', 'SO', 'DUK', 'AEP', 'SRE', 'XEL', 'PEG', 'ED'] },
      { label: 'Diversified Utilities', stocks: ['EXC', 'ETR', 'WEC', 'AWK'] },
    ],
  },
  {
    sector: 'Real Estate',
    etf: 'XLRE',
    colSpan: 2,
    rowSpan: 2,
    groups: [
      { label: 'Industrial & Data', stocks: ['PLD', 'EQIX', 'DLR', 'PSA', 'CCI', 'AMT'] },
      { label: 'Retail & Healthcare', stocks: ['O', 'WELL', 'SPG', 'VICI', 'AVB'] },
    ],
  },
];

const ALL_SYMBOLS = [
  ...new Set(SECTOR_CONFIG.flatMap((sector) => [sector.etf, ...sector.groups.flatMap((group) => group.stocks)])),
];

const LEGEND_VALUES = [-3, -2, -1, 0, 1, 2, 3];

function getHeatColor(pct: number | null, palette: ReturnType<typeof getThemePalette>): string {
  if (pct == null) return palette.elevated;
  const clamped = Math.max(-3, Math.min(3, pct));

  if (Math.abs(clamped) < 0.12) {
    return palette.elevated;
  }

  if (clamped > 0) {
    const intensity = clamped / 3;
    const saturation = 42 + intensity * 18;
    const lightness = 18 + intensity * 14;
    return `hsl(98, ${saturation}%, ${lightness}%)`;
  }

  const intensity = Math.abs(clamped) / 3;
  const saturation = 46 + intensity * 18;
  const lightness = 18 + intensity * 13;
  return `hsl(356, ${saturation}%, ${lightness}%)`;
}

function getHeatAccentColor(pct: number | null, palette: ReturnType<typeof getThemePalette>): string {
  if (pct == null) return palette.muted;
  if (pct > 0.08) return palette.positive;
  if (pct < -0.08) return palette.negative;
  return palette.muted;
}

function getSectorCardStyle(
  totalValue: number,
  boardTotalValue: number,
  sectorChange: number | null,
  palette: ReturnType<typeof getThemePalette>
): CSSProperties & Record<string, string> {
  const share = boardTotalValue > 0 ? totalValue / boardTotalValue : 1 / SECTOR_CONFIG.length;
  const areaUnits = Math.max(4, Math.min(18, Math.round(share * 58)));
  const colSpan = Math.max(2, Math.min(6, Math.round(Math.sqrt(areaUnits * 1.85))));
  const rowSpan = Math.max(2, Math.min(5, Math.ceil(areaUnits / colSpan)));
  const mdAreaUnits = Math.max(3, Math.min(10, Math.round(areaUnits * 0.58)));
  const mdColSpan = Math.max(2, Math.min(4, Math.round(Math.sqrt(mdAreaUnits * 1.65))));
  const mdRowSpan = Math.max(2, Math.min(4, Math.ceil(mdAreaUnits / mdColSpan)));

  return {
    '--heatmap-col-span': String(colSpan),
    '--heatmap-row-span': String(rowSpan),
    '--heatmap-col-span-md': String(mdColSpan),
    '--heatmap-row-span-md': String(mdRowSpan),
    '--heatmap-accent': getHeatAccentColor(sectorChange, palette),
  };
}

function HeatmapTileContent(props: HeatmapTileProps & { palette: ReturnType<typeof getThemePalette>; onSelect: (symbol: string) => void }) {
  const {
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth = 0,
  palette,
  onSelect,
  } = props;
  const payload = heatmapNodeEntry(props);
  if (depth !== 1 || !payload || width <= 0 || height <= 0) return null;

  const inset = width < 36 || height < 28 ? 0.5 : 1;
  const innerWidth = Math.max(0, width - inset * 2);
  const innerHeight = Math.max(0, height - inset * 2);
  const fill = getHeatColor(payload.changePct, palette);
  const showSymbol = innerWidth > 26 && innerHeight > 18;
  const showChange = innerWidth > 72 && innerHeight > 42;
  const showCompany = innerWidth > 120 && innerHeight > 66;
  const vertical = innerHeight > innerWidth * 1.35 && innerWidth < 52;
  const symbolFontSize = Math.max(11, Math.min(20, Math.min(innerWidth / 4.4, innerHeight / (showChange ? 3.6 : 2.3))));
  const companyLabel = payload.shortName.replace(/\s+Class A|\s+Class C|\s+Common Stock/gi, '');

  const changeLabel = payload.changePct == null ? 'Change unavailable' : fmt.pct(payload.changePct);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Open ${payload.symbol}, ${companyLabel}, ${changeLabel}`}
      className="cursor-pointer focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-terminal-accent"
      onClick={() => onSelect(payload.symbol)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(payload.symbol);
        }
      }}
    >
      <rect
        x={x + inset}
        y={y + inset}
        width={innerWidth}
        height={innerHeight}
        rx={3}
        fill={fill}
        stroke={palette.border}
        strokeWidth={1}
      />
      <title>{`${payload.symbol} · ${companyLabel} · ${changeLabel} · ${payload.group} · Market cap ${payload.marketCap == null ? 'unavailable' : fmt.marketCap(payload.marketCap)}`}</title>
      {showSymbol && (
        <foreignObject
          x={x + inset + 2}
          y={y + inset + 2}
          width={Math.max(0, innerWidth - 4)}
          height={Math.max(0, innerHeight - 4)}
        >
          <div className={`market-heatmap-node${vertical ? ' market-heatmap-node--vertical' : ''}`}>
            <span className="market-heatmap-node-symbol" style={{ fontSize: `${symbolFontSize}px` }}>
              {payload.symbol}
            </span>
            {showChange && (
              <span className="market-heatmap-node-change">
                {payload.changePct == null ? '—' : fmt.pct(payload.changePct)}
              </span>
            )}
            {showCompany && !vertical && (
              <span className="market-heatmap-node-company">
                {companyLabel}
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export function HeatmapPanel() {
  const { setActivePanel } = useTerminalStore();
  const [sizeMode, setSizeMode] = useState<HeatmapSizeMode>('market-cap');
  useTheme();
  const themePalette = getThemePalette();

  const { data: quotes = [], isLoading, isFetching, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['heatmap', ALL_SYMBOLS],
    queryFn: async () => {
      const result = await fetchQuotes(ALL_SYMBOLS);
      if (!result.length) throw new Error('No heatmap quotes are available');
      return result;
    },
    refetchInterval: 120000,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const sampleEntries = SECTOR_CONFIG.flatMap((config) => buildHeatmapEntries(config.groups, quoteMap, 'equal'));
  const sectors = SECTOR_CONFIG.map((config) => {
    const entries = buildHeatmapEntries(config.groups, quoteMap, sizeMode);
    const totalValue = entries.reduce((sum, entry) => sum + entry.value, 0);
    const sectorEtfChange = heatmapQuoteChange(quoteMap.get(config.etf));
    const sectorChange = sectorEtfChange ?? weightedHeatmapChange(entries);
    const requestedCount = config.groups.reduce((sum, group) => sum + group.stocks.length, 0);
    const quotedCount = config.groups.reduce((sum, group) => sum + group.stocks.filter((symbol) => quoteMap.has(symbol)).length, 0);
    return { ...config, entries, totalValue, sectorChange, sectorEtfChange, requestedCount, quotedCount };
  }).sort((left, right) => right.totalValue - left.totalValue);

  const boardTotalValue = sectors.reduce((sum, sector) => sum + sector.totalValue, 0);
  const displayedCount = sectors.reduce((sum, sector) => sum + sector.entries.length, 0);
  const requestedCount = SECTOR_CONFIG.reduce((sum, sector) => sum + sector.groups.reduce((total, group) => total + group.stocks.length, 0), 0);
  const knownChanges = sampleEntries.filter((entry) => entry.changePct != null);
  const advancing = knownChanges.filter((entry) => entry.changePct! > 0).length;
  const declining = knownChanges.filter((entry) => entry.changePct! < 0).length;
  const movers = [...knownChanges].sort((left, right) => Math.abs(right.changePct!) - Math.abs(left.changePct!)).slice(0, 8);
  const updatedLabel = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const openSymbol = (symbol: string) => setActivePanel('equity', symbol);

  return (
    <div className="h-full overflow-y-auto bg-terminal-bg text-terminal-text">
      <div className="px-3 py-3 md:px-4 md:py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-terminal-accent">US stock sample</div>
            <h1 className="text-[24px] leading-none font-bold tracking-wide text-terminal-text">Sector Heatmap</h1>
            <div className="mt-2 text-xs text-terminal-faint max-w-3xl leading-relaxed">
              Latest available regular-session change versus the previous close. This curated large-company sample is not the full market or the sector ETFs' holdings; quotes may be delayed.
            </div>
          </div>
          <button type="button" disabled={isFetching} onClick={() => void refetch()} className="shrink-0 border border-terminal-border rounded px-3 py-1.5 text-xs text-terminal-muted hover:text-terminal-text disabled:opacity-50">
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-terminal-faint">Tile size</span>
            {([{ key: 'market-cap', label: 'Market cap' }, { key: 'equal', label: 'Equal size' }] as const).map((item) => (
              <button key={item.key} type="button" aria-pressed={sizeMode === item.key} onClick={() => setSizeMode(item.key)} className={`rounded border px-2 py-1 ${sizeMode === item.key ? 'border-terminal-accent/50 text-terminal-accent bg-terminal-accent/10' : 'border-terminal-border text-terminal-muted hover:text-terminal-text'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-terminal-faint" aria-label="Color scale from minus three percent or lower to plus three percent or higher">
            <span>−3% or less</span>
            {LEGEND_VALUES.map((value) => <span key={value} className="market-heatmap-legend-chip" style={{ backgroundColor: getHeatColor(value, themePalette) }} />)}
            <span>+3% or more</span>
            <span className="market-heatmap-legend-chip ml-2" style={{ backgroundColor: getHeatColor(null, themePalette) }} />
            <span>No change data</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-xs mb-3">
          <span><strong className="text-terminal-text">{sampleEntries.length}/{requestedCount}</strong> <span className="text-terminal-faint">quotes available</span></span>
          <span><strong style={{ color: themePalette.positive }}>{advancing}</strong> <span className="text-terminal-faint">advancing</span></span>
          <span><strong style={{ color: themePalette.negative }}>{declining}</strong> <span className="text-terminal-faint">declining</span></span>
          <span><strong>{knownChanges.length - advancing - declining}</strong> <span className="text-terminal-faint">unchanged</span></span>
          <span><strong>{sampleEntries.length - knownChanges.length}</strong> <span className="text-terminal-faint">without a change</span></span>
          {updatedLabel && <span className="text-terminal-faint ml-auto">Checked {updatedLabel}</span>}
        </div>

        {sizeMode === 'market-cap' && displayedCount < sampleEntries.length && <div className="mb-3 text-xs text-terminal-muted">{sampleEntries.length - displayedCount} quoted companies have no valid market cap and are omitted from weighted tiles. Choose Equal size to include them.</div>}
        {(isError || (!isLoading && sampleEntries.length === 0)) && <div role="status" className="mb-4 rounded border border-terminal-border p-4 text-sm text-terminal-muted">{sampleEntries.length ? 'The refresh failed. Previously received quotes remain visible.' : 'Quotes are unavailable right now. Refresh to try again; unavailable data is not shown as a flat market.'}</div>}
        {isLoading && <div role="status" className="shimmer rounded h-32 mb-4 flex items-center justify-center text-terminal-faint text-sm">Loading available quotes…</div>}

        {movers.length > 0 && <section className="mb-4" aria-label="Largest absolute moves in the sample">
          <div className="text-[10px] tracking-wider text-terminal-faint mb-2">LARGEST MOVES IN THIS SAMPLE · SELECT A SYMBOL TO RESEARCH</div>
          <div className="flex flex-wrap gap-2">
            {movers.map((entry) => <button key={entry.symbol} type="button" onClick={() => openSymbol(entry.symbol)} title={`${entry.shortName} · ${entry.group}`} className="rounded border border-terminal-border bg-terminal-panel px-2.5 py-1.5 text-xs hover:bg-terminal-hover">
              <span className="font-bold">{entry.symbol}</span><span className="ml-2 tabular-nums" style={{ color: getHeatAccentColor(entry.changePct, themePalette) }}>{fmt.pct(entry.changePct!)}</span>
            </button>)}
          </div>
        </section>}

        {sampleEntries.length > 0 && <div className="market-heatmap-board">
          {sectors.map((sector) => (
            <section key={sector.sector} className="market-heatmap-sector" style={getSectorCardStyle(sector.totalValue, boardTotalValue, sector.sectorChange, themePalette)}>
              <button type="button" onClick={() => openSymbol(sector.etf)} className="w-full text-left px-3 pt-3 pb-2" title={`Open sector ETF ${sector.etf}; it is a separate benchmark, not this sample's portfolio`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold tracking-wide">{sector.sector}</div>
                    <div className="mt-1 text-[11px] text-terminal-faint">{sector.entries.length}/{sector.requestedCount} sample tiles · {sector.quotedCount} quotes</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] tracking-wider text-terminal-faint">{sector.sectorEtfChange == null ? 'SAMPLE MOVE' : `${sector.etf} ETF`}</div>
                    <div className="text-sm tabular-nums font-bold" style={{ color: getHeatAccentColor(sector.sectorChange, themePalette) }}>{sector.sectorChange == null ? '—' : fmt.pct(sector.sectorChange)}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-terminal-faint" title="This is a share of the stocks shown here, not total market or ETF portfolio weight.">{boardTotalValue > 0 ? `${fmt.number(sector.totalValue / boardTotalValue * 100, 1)}% of displayed ${sizeMode === 'market-cap' ? 'market cap' : 'companies'}` : 'No sizing data'}</div>
              </button>
              <div className="market-heatmap-sector-body">
                {sector.entries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap data={sector.entries} dataKey="value" aspectRatio={1.15} stroke={themePalette.border} isAnimationActive={false} content={<HeatmapTileContent palette={themePalette} onSelect={openSymbol} />} />
                  </ResponsiveContainer>
                ) : <div className="h-full flex items-center justify-center text-terminal-faint text-xs px-3 text-center">{sizeMode === 'market-cap' && sector.quotedCount > 0 ? 'No valid market caps. Choose Equal size.' : 'No available sample quotes'}</div>}
              </div>
            </section>
          ))}
        </div>}

        <div className="pt-3 text-[11px] text-terminal-faint leading-relaxed">
          Sector areas are approximate; tile area uses {sizeMode === 'market-cap' ? 'reported company market cap' : 'equal weights'}. Missing changes are grey, not zero. Sector headings show the sector ETF's change when available, otherwise a weighted move of the displayed sample. Source: Yahoo Finance. Click or keyboard-select a tile to open its research page.
        </div>
      </div>
    </div>
  );
}

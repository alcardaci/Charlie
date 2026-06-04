import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, Treemap } from 'recharts';
import { fetchQuotes } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt } from '../utils/formatters';
import { getThemePalette, useTheme } from '../utils/theme';

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

type HeatmapEntry = {
  name: string;
  symbol: string;
  shortName: string;
  value: number;
  changePct: number;
  group: string;
  marketCap: number | null;
};

type HeatmapTileProps = {
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

function getHeatColor(pct: number, palette: ReturnType<typeof getThemePalette>): string {
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

function getHeatAccentColor(pct: number, palette: ReturnType<typeof getThemePalette>): string {
  if (pct > 0.08) return palette.positive;
  if (pct < -0.08) return palette.negative;
  return palette.muted;
}

function getSectorCardStyle(
  totalValue: number,
  boardTotalValue: number,
  sectorChange: number,
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

function getEntryValue(marketCap: number | undefined | null, price: number | undefined | null): number {
  if (marketCap && Number.isFinite(marketCap)) return marketCap;
  if (price && Number.isFinite(price)) return price * 1e9;
  return 1;
}

function HeatmapTileContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth = 0,
  payload,
  palette,
}: HeatmapTileProps & { palette: ReturnType<typeof getThemePalette> }) {
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

  return (
    <g>
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
      <title>{`${payload.symbol} · ${companyLabel} · ${fmt.pct(payload.changePct)}`}</title>
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
                {fmt.pct(payload.changePct)}
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
  useTheme();
  const themePalette = getThemePalette();

  const { data: quotes = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['heatmap', ALL_SYMBOLS],
    queryFn: () => fetchQuotes(ALL_SYMBOLS),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  if (isLoading && quotes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-terminal-bg">
        <div className="text-terminal-faint tracking-[0.18em] animate-pulse">LOADING HEATMAP...</div>
      </div>
    );
  }

  const sectors = SECTOR_CONFIG.map((config) => {
    const entries = config.groups
      .flatMap((group) =>
        group.stocks.map((symbol) => {
          const quote = quoteMap.get(symbol);
          if (!quote) return null;

          return {
            name: symbol,
            symbol,
            shortName: quote.shortName ?? quote.longName ?? symbol,
            value: getEntryValue(quote.marketCap, quote.regularMarketPrice),
            changePct: quote.regularMarketChangePercent ?? 0,
            group: group.label,
            marketCap: quote.marketCap ?? null,
          } satisfies HeatmapEntry;
        })
      )
      .filter((entry): entry is HeatmapEntry => Boolean(entry))
      .sort((left, right) => right.value - left.value);

    const sectorQuote = quoteMap.get(config.etf);
    const totalValue = entries.reduce((sum, entry) => sum + entry.value, 0);
    const weightedChange = totalValue
      ? entries.reduce((sum, entry) => sum + entry.changePct * entry.value, 0) / totalValue
      : 0;
    const sectorChange = sectorQuote?.regularMarketChangePercent ?? weightedChange;
    const dominantGroups = config.groups
      .map((group) => ({
        label: group.label,
        value: group.stocks.reduce((sum, symbol) => {
          const quote = quoteMap.get(symbol);
          return sum + getEntryValue(quote?.marketCap, quote?.regularMarketPrice);
        }, 0),
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)
      .map((group) => group.label)
      .join('   ');

    return {
      ...config,
      entries,
      sectorChange,
      dominantGroups,
      totalValue,
    };
  }).sort((left, right) => right.totalValue - left.totalValue);

  const boardTotalValue = sectors.reduce((sum, sector) => sum + sector.totalValue, 0);

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      })
    : 'Live pricing';

  return (
    <div className="h-full overflow-y-auto bg-terminal-bg text-terminal-text">
      <div className="px-3 py-3 md:px-4 md:py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-terminal-accent">Market Map</div>
            <h1 className="text-[24px] leading-none font-bold tracking-wide text-terminal-text">
              Sector Heatmap
            </h1>
            <div className="mt-1 text-[12px] text-terminal-faint">
              Sector cards are sized by aggregate market cap. Inner tiles are sized by constituent market cap and colored by session performance.
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12px] text-terminal-faint">
            <span className="font-medium text-terminal-muted">Scale</span>
            <div className="flex items-center gap-1">
              {LEGEND_VALUES.map((value) => (
                <div key={value} className="flex items-center gap-1">
                  <span className="market-heatmap-legend-chip" style={{ backgroundColor: getHeatColor(value, themePalette) }} />
                  {value === LEGEND_VALUES[0] || value === LEGEND_VALUES[LEGEND_VALUES.length - 1] ? (
                    <span className="tabular-nums">{value > 0 ? `+${value}%` : `${value}%`}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="market-heatmap-board">
          {sectors.map((sector) => (
            <section
              key={sector.sector}
              className="market-heatmap-sector"
              style={getSectorCardStyle(sector.totalValue, boardTotalValue, sector.sectorChange, themePalette)}
            >
              <button
                onClick={() => setActivePanel('equity', sector.etf)}
                className="w-full text-left px-3 pt-3 pb-2"
                title={`Open ${sector.etf}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-end gap-2 leading-none">
                      <span className="text-[14px] md:text-[16px] font-bold tracking-wide text-terminal-text">
                        {sector.sector}
                      </span>
                      <span
                        className="text-[12px] md:text-[13px] font-medium tabular-nums"
                        style={{ color: getHeatAccentColor(sector.sectorChange, themePalette) }}
                      >
                        {fmt.pct(sector.sectorChange)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] md:text-[12px] text-terminal-faint truncate">
                      {sector.dominantGroups}
                    </div>
                  </div>

                  <div className="flex-shrink-0 rounded border border-terminal-border bg-terminal-elevated px-1.5 py-1 text-right">
                    <div className="text-[10px] font-bold tracking-[0.16em] text-terminal-accent">{sector.etf}</div>
                    <div className="mt-0.5 text-[10px] tabular-nums text-terminal-faint">
                      {fmt.number(boardTotalValue > 0 ? (sector.totalValue / boardTotalValue) * 100 : 0, 1)}%
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-terminal-bg/90">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(8, boardTotalValue > 0 ? (sector.totalValue / boardTotalValue) * 100 : 8)}%`,
                        backgroundColor: getHeatAccentColor(sector.sectorChange, themePalette),
                      }}
                    />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-terminal-faint">Sector Share</span>
                </div>
              </button>

              <div className="market-heatmap-sector-body">
                {sector.entries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={sector.entries}
                      dataKey="value"
                      aspectRatio={1.15}
                      stroke={themePalette.border}
                      isAnimationActive={false}
                      content={<HeatmapTileContent palette={themePalette} />}
                      onClick={(node) => {
                        const clickedNode = node as typeof node & { payload?: HeatmapEntry; symbol?: string };
                        const symbol = clickedNode.payload?.symbol ?? clickedNode.symbol;
                        if (symbol) setActivePanel('equity', symbol);
                      }}
                    />
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-terminal-faint text-[12px]">
                    No sector data
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-3 text-[12px] text-terminal-faint md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-terminal-muted">Live board</span>
            <span>Sector card area reflects aggregate market cap. Inner tile area reflects company market cap. Click any sector or tile to open the corresponding security.</span>
          </div>
          <div className="tabular-nums">{updatedLabel}</div>
        </div>
      </div>
    </div>
  );
}

import { Fragment, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, DollarSign, Download, Pencil, Plus, Trash2, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { Area, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartDotPattern } from '../components/ChartDotPattern';
import { fetchChartWindow, fetchForexPairs, fetchQuotes, searchSymbols } from '../api/finance';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { useTerminalStore } from '../store/useTerminalStore';
import { ChartInterval, ChartRange, PortfolioPosition, Quote } from '../types';
import { changeColor, fmt } from '../utils/formatters';
import { importPortfolioCsv } from '../utils/portfolioImport';
import { buildAdaptiveAxisScale, buildBenchmarkOverlay, buildPortfolioHistory, trimPortfolioHistory, isValidPortfolioPurchaseDate, type PortfolioHistoryPoint, type PortfolioChartPoint } from '../utils/portfolioHistory';
import { getThemePalette, useTheme } from '../utils/theme';
import { buildPortfolioFxMap, normalizePortfolioCurrency, quoteCurrencyUnit, valuePortfolioLot } from '../utils/portfolioValuation';

const DEFAULT_PORTFOLIO_CURRENCY = 'USD';
const PORTFOLIO_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'DKK', 'SEK', 'NOK', 'HKD', 'SGD'] as const;
const MARKET_BENCHMARK_SYMBOL = '^GSPC';
const MARKET_BENCHMARK_LABEL = 'S&P 500';

type LotFields = {
  shares: string;
  avgCost: string;
  purchaseDate: string;
};

type LotDraft = LotFields & {
  id: string;
};

type EditLotDraft = LotFields & {
  id: string;
  symbol: string;
};

type PortfolioLot = PortfolioPosition & {
  purchaseDate: string;
  currency: string;
  currentPrice: number;
  currentValue: number;
  displayCurrentPrice: number;
  displayCurrentValue: number;
  displayTotalCost: number;
  displayGainLoss: number;
  totalCost: number;
  gainLoss: number;
  gainLossPct: number;
  shortName: string;
  conversionRate: number | null;
  priceScale: number | null;
  missingQuote: boolean;
  missingFx: string[];
};

type GroupedPosition = {
  symbol: string;
  shortName: string;
  currency: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  displayAvgCost: number;
  displayCurrentPrice: number;
  displayCurrentValue: number;
  displayTotalCost: number;
  displayGainLoss: number;
  totalCost: number;
  gainLoss: number;
  gainLossPct: number;
  lotCount: number;
  lots: PortfolioLot[];
};

type PortfolioSortKey =
  | 'symbol'
  | 'lotCount'
  | 'shares'
  | 'avgCost'
  | 'currentPrice'
  | 'currentValue'
  | 'gainLoss'
  | 'gainLossPct';

type SortDirection = 'asc' | 'desc';
type HistorySelectionMode = 'all' | 'custom' | 'none';
type PortfolioValueMode = 'aggregate' | 'byCurrency';

const PORTFOLIO_HISTORY_TIMEFRAMES: Array<{ label: string; range: ChartRange; interval: ChartInterval; lookbackDays?: number }> = [
  { label: '7D', range: '1mo', interval: '1d', lookbackDays: 7 },
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '3M', range: '3mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1d' },
  { label: '2Y', range: '2y', interval: '1wk' },
  { label: '5Y', range: '5y', interval: '1mo' },
  { label: 'MAX', range: 'max', interval: '1mo' },
];

type ImportFeedback = {
  tone: 'success' | 'warning' | 'error';
  message: string;
};

function createLotDraft(): LotDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    shares: '',
    avgCost: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
  };
}

function resolvePurchaseDate(position: PortfolioPosition): string {
  if (position.purchaseDate) return position.purchaseDate;
  if (position.addedAt) return position.addedAt.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function formatPortfolioDate(dateText: string): string {
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatShares(shares: number): string {
  if (Number.isInteger(shares)) return fmt.integer(shares);
  return fmt.number(shares, shares < 1 ? 4 : 3);
}

function parseLotFields(lot: LotFields) {
  const shares = Number(lot.shares);
  const avgCost = Number(lot.avgCost);
  const purchaseDate = lot.purchaseDate;
  const isValid = Number.isFinite(shares) && shares > 0 && Number.isFinite(avgCost) && avgCost > 0 && isValidPortfolioPurchaseDate(purchaseDate);
  return { shares, avgCost, purchaseDate, isValid };
}

function normalizePortfolioSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function getCurrencyOptions(activeCurrencies: string[]): string[] {
  return Array.from(new Set([...PORTFOLIO_CURRENCIES, ...activeCurrencies.map(normalizePortfolioCurrency)])).sort();
}

function inferPortfolioAssetClass(symbol: string, quote?: Quote): string {
  const type = `${quote?.quoteType ?? ''} ${quote?.typeDisp ?? ''}`.toUpperCase();

  if (type.includes('CRYPTO')) return 'Crypto';
  if (type.includes('ETF') || type.includes('ETN')) return 'ETF';
  if (type.includes('MUTUAL') || type.includes('MONEY MARKET') || type.includes('FUND')) return 'Mutual Fund';
  if (type.includes('INDEX')) return 'Index';
  if (symbol.endsWith('=X') || type.includes('CURRENCY') || type.includes('FOREX')) return 'FX';
  if (symbol.endsWith('=F')) return 'Commodity';
  if (type.includes('EQUITY') || type.includes('STOCK')) return 'Equity';
  return 'Other';
}

function escapeCsvCell(value: string | number): string {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function comparePortfolioRows(
  left: GroupedPosition,
  right: GroupedPosition,
  sortKey: PortfolioSortKey,
  sortDirection: SortDirection
): number {
  const direction = sortDirection === 'asc' ? 1 : -1;

  const leftValue = sortKey === 'symbol'
    ? left.symbol
    : sortKey === 'avgCost'
      ? left.displayAvgCost
      : sortKey === 'currentPrice'
        ? left.displayCurrentPrice
        : sortKey === 'currentValue'
          ? left.displayCurrentValue
          : sortKey === 'gainLoss'
            ? left.displayGainLoss
            : left[sortKey];
  const rightValue = sortKey === 'symbol'
    ? right.symbol
    : sortKey === 'avgCost'
      ? right.displayAvgCost
      : sortKey === 'currentPrice'
        ? right.displayCurrentPrice
        : sortKey === 'currentValue'
          ? right.displayCurrentValue
          : sortKey === 'gainLoss'
            ? right.displayGainLoss
            : right[sortKey];

  if (typeof leftValue === 'string' && typeof rightValue === 'string') {
    return leftValue.localeCompare(rightValue) * direction;
  }

  return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
}

function formatCompactCurrencyAmount(value: number, currency: string, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${currency} ${fmt.price(value, decimals)}`;
  }
}

function formatRoundedCurrencyAxisTick(value: number, step: number, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return formatCompactCurrencyAmount(0, currency, 0);
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const units = [
    { threshold: 1e12, divisor: 1e12, suffix: 'T' },
    { threshold: 1e9, divisor: 1e9, suffix: 'B' },
    { threshold: 1e6, divisor: 1e6, suffix: 'M' },
    { threshold: 1e3, divisor: 1e3, suffix: 'K' },
  ];
  const unit = units.find((item) => absolute >= item.threshold);
  const divisor = unit?.divisor ?? 1;
  const suffix = unit?.suffix ?? '';
  const scaledValue = absolute / divisor;
  const scaledStep = Math.abs(step) / divisor;
  const decimals = scaledStep >= 1 ? 0 : scaledStep >= 0.1 ? 1 : scaledStep >= 0.01 ? 2 : 3;

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(scaledValue);

  return `${sign}${formatted.replace('-', '')}${suffix}`;
}

function formatCurrencyAmount(value: number, currency: string, decimals = 2): string {
  return formatCompactCurrencyAmount(value, currency, decimals);
}

function formatRoundedNumberAxisTick(value: number, step: number): string {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const units = [
    { threshold: 1e12, divisor: 1e12, suffix: 'T' },
    { threshold: 1e9, divisor: 1e9, suffix: 'B' },
    { threshold: 1e6, divisor: 1e6, suffix: 'M' },
    { threshold: 1e3, divisor: 1e3, suffix: 'K' },
  ];
  const unit = units.find((item) => absolute >= item.threshold);
  const divisor = unit?.divisor ?? 1;
  const suffix = unit?.suffix ?? '';
  const scaledValue = absolute / divisor;
  const scaledStep = Math.abs(step) / divisor;
  const decimals = scaledStep >= 1 ? 0 : scaledStep >= 0.1 ? 1 : scaledStep >= 0.01 ? 2 : 3;

  return `${sign}${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(scaledValue)}${suffix}`;
}

function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AllocationChart({ data, currency, mode, palette }: {
  data: Array<{ name: string; value: number; pct: number }>;
  currency: string;
  mode: 'dark' | 'light';
  palette: ReturnType<typeof getThemePalette>;
}) {
  const patternId = useId();
  // Spacing hues around the wheel gives adjacent slices a distinct color, even in a long symbol list.
  const swatches = data.map((item, index) => {
    const hue = (233 + (index - 1) * 137.508) % 360;
    const ink = index === 0 ? palette.accent : `oklch(${mode === 'dark' ? '75%' : '48%'} 0.13 ${hue})`;
    const surface = `color-mix(in srgb, ${ink} 19%, ${palette.panel})`;
    return { name: item.name, pct: item.pct, ink, surface, id: `${patternId}-slice-${index}` };
  });
  return (
    <>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <defs>
            {swatches.map(swatch => <ChartDotPattern key={swatch.name} id={swatch.id} ink={swatch.ink} surface={swatch.surface} />)}
          </defs>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
            {swatches.map(swatch => <Cell key={swatch.name} fill={`url(#${swatch.id})`} stroke={swatch.ink} strokeWidth={0.85} />)}
          </Pie>
          <Tooltip
            formatter={(value: number) => [formatCurrencyAmount(value, currency, 2), 'Value']}
            contentStyle={{ background: palette.elevated, border: `1px solid ${palette.border}`, borderRadius: 4, fontSize: 11 }}
            labelStyle={{ color: palette.text }} itemStyle={{ color: palette.muted }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1 mt-2">
        {swatches.map(swatch => (
          <div key={swatch.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <svg width="11" height="11" className="shrink-0" aria-hidden="true">
                <rect x="0.5" y="0.5" width="10" height="10" rx="2" fill={`url(#${swatch.id})`} stroke={swatch.ink} />
              </svg>
              <span className="text-terminal-text truncate">{swatch.name}</span>
            </div>
            <span className="text-terminal-muted tabular-nums">{swatch.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function PortfolioPanel() {
  const { mode } = useTheme();
  const themePalette = getThemePalette();
  const {
    portfolio,
    addPortfolioPositions,
    updatePortfolioPosition,
    updatePortfolioAssetCurrency,
    removePortfolioPosition,
    clearPortfolio,
    setActivePanel,
    portfolioDisplayCurrency: displayCurrency,
    setPortfolioDisplayCurrency,
  } = useTerminalStore();
  const [showAdd, setShowAdd] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [addCurrency, setAddCurrency] = useState(DEFAULT_PORTFOLIO_CURRENCY);
  const [portfolioValueMode, setPortfolioValueMode] = useState<PortfolioValueMode>('aggregate');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lotDrafts, setLotDrafts] = useState<LotDraft[]>([createLotDraft()]);
  const [editingLot, setEditingLot] = useState<EditLotDraft | null>(null);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);
  const [expandedSymbols, setExpandedSymbols] = useState<string[]>([]);
  const [showClearPortfolioConfirm, setShowClearPortfolioConfirm] = useState(false);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
  const [sortKey, setSortKey] = useState<PortfolioSortKey>('currentValue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [historyRange, setHistoryRange] = useState<ChartRange>('1y');
  const [historyLookbackDays, setHistoryLookbackDays] = useState<number | undefined>(undefined);
  const [historySelectionMode, setHistorySelectionMode] = useState<HistorySelectionMode>('all');
  const [selectedHistorySymbols, setSelectedHistorySymbols] = useState<string[]>([]);
  const [showMarketBenchmark, setShowMarketBenchmark] = useState(false);
  const [showCostBasis, setShowCostBasis] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sharesInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editSharesInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const symbols = [...new Set(portfolio.map((position) => normalizePortfolioSymbol(position.symbol)).filter(Boolean))].sort();
  const assetCurrencyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const position of portfolio) {
      const symbol = normalizePortfolioSymbol(position.symbol);
      if (!symbol || map.has(symbol)) continue;
      map.set(symbol, normalizePortfolioCurrency(position.currency));
    }
    return map;
  }, [portfolio]);
  const activeCurrencies = useMemo(
    () => Array.from(new Set(portfolio.map((position) => normalizePortfolioCurrency(position.currency)))),
    [portfolio]
  );
  const currencyOptions = useMemo(
    () => getCurrencyOptions([...activeCurrencies, addCurrency, displayCurrency]),
    [activeCurrencies, addCurrency, displayCurrency]
  );

  const { data: quotes = [], isFetching: refreshingQuotes, isError: quoteError, refetch: refetchQuotes } = useQuery({
    queryKey: ['portfolio-quotes', symbols],
    queryFn: () => fetchQuotes(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['portfolio-search', symbolInput],
    queryFn: () => searchSymbols(symbolInput),
    enabled: showAdd && symbolInput.length >= 1,
    staleTime: 10000,
  });

  const { data: editSuggestions = [] } = useQuery({
    queryKey: ['portfolio-edit-search', editingLot?.symbol ?? ''],
    queryFn: () => searchSymbols(editingLot?.symbol ?? ''),
    enabled: Boolean(editingLot) && (editingLot?.symbol.length ?? 0) >= 1,
    staleTime: 10000,
  });

  const activeHistoryTimeframe = PORTFOLIO_HISTORY_TIMEFRAMES.find(
    (option) => option.range === historyRange && option.lookbackDays === historyLookbackDays
  ) ?? PORTFOLIO_HISTORY_TIMEFRAMES[4];
  const effectiveHistorySymbols = useMemo(() => {
    const available = symbols;
    const filtered = selectedHistorySymbols.filter((symbol) => available.includes(symbol));
    if (historySelectionMode === 'all') return available;
    if (historySelectionMode === 'none') return [];
    return filtered;
  }, [historySelectionMode, symbols.join(','), selectedHistorySymbols]);
  // Price history is cached independently of lots, FX, and chart selection so local
  // edits do not refetch every asset. These keys are also shared by Equity Chart.
  const historySymbols = [...effectiveHistorySymbols].sort();
  const historyQueries = useQueries({
    queries: historySymbols.map((symbol) => ({
      queryKey: ['chart', symbol, activeHistoryTimeframe.range, activeHistoryTimeframe.interval, null, null],
      queryFn: () => fetchChartWindow(symbol, { range: activeHistoryTimeframe.range, interval: activeHistoryTimeframe.interval }),
      staleTime: 300000,
      gcTime: 1800000,
      retry: 1,
    })),
  });
  const chartSeries = historySymbols.map((symbol, index) => ({ symbol, points: historyQueries[index]?.data?.points ?? [], currency: (historyQueries[index]?.data as { currency?: string } | undefined)?.currency }));
  const fxCurrencies = [...new Set([...activeCurrencies, ...quotes.map((quote) => quoteCurrencyUnit(quote.currency).currency), ...chartSeries.filter((series) => series.currency).map((series) => quoteCurrencyUnit(series.currency).currency)])].sort();
  const fxCurrencyKey = fxCurrencies.join(',');
  const { data: fxPairs = [], isLoading: loadingFxRates } = useQuery({
    queryKey: ['portfolio-fx-rates', fxCurrencyKey, displayCurrency],
    queryFn: () =>
      fetchForexPairs(
        fxCurrencies
          .filter((currency) => currency !== displayCurrency)
          .map((currency) => ({
            base: currency,
            quote: displayCurrency,
          }))
      ),
    enabled: fxCurrencies.some((currency) => currency !== displayCurrency),
    staleTime: 300000,
    refetchInterval: 300000,
  });
  const fxRateMap = useMemo(() => buildPortfolioFxMap(displayCurrency, fxPairs), [displayCurrency, fxPairs]);

  const quoteMap = new Map(quotes.map((quote) => [normalizePortfolioSymbol(quote.symbol), quote]));

  const lots: PortfolioLot[] = portfolio.map((position) => {
    const purchaseDate = resolvePurchaseDate(position);
    const symbol = normalizePortfolioSymbol(position.symbol);
    const quote = quoteMap.get(symbol);
    const value = valuePortfolioLot(position, quote, displayCurrency, fxRateMap);
    return {
      ...position,
      ...value,
      symbol,
      purchaseDate,
      gainLossPct: value.totalCost ? value.gainLoss / value.totalCost * 100 : 0,
      shortName: quote?.shortName ?? quote?.longName ?? position.symbol,
    };
  });

  const groupedMap = new Map<string, GroupedPosition>();
  for (const lot of lots) {
    const existing = groupedMap.get(lot.symbol);
    if (existing) {
      existing.shares += lot.shares;
      existing.totalCost += lot.totalCost;
      existing.currentValue += lot.currentValue;
      existing.gainLoss += lot.gainLoss;
      existing.displayTotalCost += lot.displayTotalCost;
      existing.displayCurrentValue += lot.displayCurrentValue;
      existing.displayGainLoss += lot.displayGainLoss;
      existing.lotCount += 1;
      existing.lots.push(lot);
      continue;
    }

    groupedMap.set(lot.symbol, {
      symbol: lot.symbol,
      shortName: lot.shortName,
      currency: lot.currency,
      shares: lot.shares,
      avgCost: 0,
      currentPrice: lot.currentPrice,
      currentValue: lot.currentValue,
      displayAvgCost: 0,
      displayCurrentPrice: lot.displayCurrentPrice,
      displayCurrentValue: lot.displayCurrentValue,
      displayTotalCost: lot.displayTotalCost,
      displayGainLoss: lot.displayGainLoss,
      totalCost: lot.totalCost,
      gainLoss: lot.gainLoss,
      gainLossPct: 0,
      lotCount: 1,
      lots: [lot],
    });
  }

  const positions = useMemo(
    () =>
      Array.from(groupedMap.values())
        .map((position) => {
          const avgCost = position.shares ? position.totalCost / position.shares : 0;
          const currentPrice = position.shares ? position.currentValue / position.shares : 0;
          const gainLossPct = position.totalCost ? (position.gainLoss / position.totalCost) * 100 : 0;
          const displayAvgCost = position.shares ? position.displayTotalCost / position.shares : 0;
          const displayCurrentPrice = position.shares ? position.displayCurrentValue / position.shares : 0;
          const lotsByDate = [...position.lots].sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));

          return {
            ...position,
            avgCost,
            currentPrice,
            displayAvgCost,
            displayCurrentPrice,
            gainLossPct,
            lots: lotsByDate,
          };
        })
        .sort((left, right) => comparePortfolioRows(left, right, sortKey, sortDirection)),
    [groupedMap, sortDirection, sortKey]
  );

  const totalValue = positions.reduce((acc, position) => acc + position.displayCurrentValue, 0);
  const totalCost = positions.reduce((acc, position) => acc + position.displayTotalCost, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPct = totalCost ? (totalGainLoss / totalCost) * 100 : 0;
  const totalLots = positions.reduce((acc, position) => acc + position.lotCount, 0);
  const currentFormSymbol = symbolInput.trim().toUpperCase();
  const isAddingToExistingPosition = currentFormSymbol.length > 0 && symbols.includes(currentFormSymbol);
  const missingFxCurrencies = Array.from(
    new Set(lots.flatMap((lot) => lot.missingFx))
  );
  const totalsByCurrency = Array.from(
    lots.reduce((groups, lot) => {
      const existing = groups.get(lot.currency) ?? {
        currency: lot.currency,
        currentValue: 0,
        totalCost: 0,
        gainLoss: 0,
      };
      existing.currentValue += lot.currentValue;
      existing.totalCost += lot.totalCost;
      existing.gainLoss += lot.gainLoss;
      groups.set(lot.currency, existing);
      return groups;
    }, new Map<string, { currency: string; currentValue: number; totalCost: number; gainLoss: number }>())
  )
    .map(([, value]) => ({
      ...value,
      gainLossPct: value.totalCost ? (value.gainLoss / value.totalCost) * 100 : 0,
    }))
    .sort((left, right) => right.currentValue - left.currentValue);

  const parsedDrafts = lotDrafts.map(parseLotFields);
  const validDraftCount = parsedDrafts.filter((draft) => draft.isValid).length;
  const canSubmit = symbolInput.trim().length > 0 && validDraftCount > 0 && validDraftCount === lotDrafts.length;
  const parsedEditingLot = editingLot ? parseLotFields(editingLot) : null;
  const canSaveEdit = Boolean(editingLot && editingLot.symbol.trim().length > 0 && parsedEditingLot?.isValid);
  const historyLots = lots.filter((lot) => effectiveHistorySymbols.includes(lot.symbol)).map((lot) => {
    const sourceCurrency = chartSeries.find((series) => series.symbol === lot.symbol)?.currency;
    if (!sourceCurrency) return lot;
    const unit = quoteCurrencyUnit(sourceCurrency, lot.currency);
    const priceRate = unit.currency === displayCurrency ? 1 : fxRateMap.get(`${unit.currency}:${displayCurrency}`) ?? null;
    return { ...lot, priceScale: priceRate != null && lot.conversionRate != null ? unit.scale * priceRate / lot.conversionRate : null };
  });
  const historyTotalValue = useMemo(
    () => positions
      .filter((position) => effectiveHistorySymbols.includes(position.symbol))
      .reduce((acc, position) => acc + position.displayCurrentValue, 0),
    [effectiveHistorySymbols, positions]
  );
  const historyTotalCost = useMemo(
    () => positions
      .filter((position) => effectiveHistorySymbols.includes(position.symbol))
      .reduce((acc, position) => acc + position.displayTotalCost, 0),
    [effectiveHistorySymbols, positions]
  );
  const selectedTotalValue = historyTotalValue;
  const selectedTotalCost = historyTotalCost;
  const selectedTotalGainLoss = selectedTotalValue - selectedTotalCost;
  const selectedTotalGainLossPct = selectedTotalCost ? (selectedTotalGainLoss / selectedTotalCost) * 100 : 0;
  const selectionScopeLabel = historySelectionMode === 'all'
    ? 'ALL CHART ASSETS'
    : historySelectionMode === 'none'
      ? 'NO CHART ASSETS'
      : `${effectiveHistorySymbols.length} CHART ASSET${effectiveHistorySymbols.length === 1 ? '' : 'S'}`;
  const loadingHistory = historyQueries.some((query) => query.isPending && query.fetchStatus === 'fetching');
  const refreshingHistory = historyQueries.some((query) => query.isFetching);
  const missingHistorySymbols = chartSeries.filter((series) => !series.points.length).map((series) => series.symbol);
  const historyFxMissing = [...new Set(historyLots.flatMap((lot) => lot.missingFx))];
  const portfolioHistory = trimPortfolioHistory(buildPortfolioHistory(historyLots, chartSeries, activeHistoryTimeframe.range), activeHistoryTimeframe.lookbackDays);
  const { data: marketBenchmarkResult, isLoading: loadingMarketBenchmark } = useQuery({
    queryKey: ['chart', MARKET_BENCHMARK_SYMBOL, activeHistoryTimeframe.range, activeHistoryTimeframe.interval, null, null],
    enabled: showMarketBenchmark && historySymbols.length > 0,
    staleTime: 300000,
    retry: 1,
    queryFn: () => fetchChartWindow(MARKET_BENCHMARK_SYMBOL, { range: activeHistoryTimeframe.range, interval: activeHistoryTimeframe.interval }),
  });
  const portfolioChartData: PortfolioChartPoint[] = showMarketBenchmark
    ? buildBenchmarkOverlay(portfolioHistory, marketBenchmarkResult?.points ?? [])
    : portfolioHistory;
  const hasMarketBenchmarkData = portfolioChartData.some((point) => Number.isFinite(point.benchmarkClose));
  const valueAxisScale = buildAdaptiveAxisScale(
    portfolioChartData.flatMap((point) => showCostBasis ? [point.value, point.cost] : [point.value]),
    { clampMinToZero: true, tickCount: 5 }
  );
  const benchmarkAxisScale = buildAdaptiveAxisScale(portfolioChartData.map((point) => point.benchmarkClose ?? Number.NaN));
  const missingQuoteSymbols = [...new Set(lots.filter((lot) => lot.missingQuote).map((lot) => lot.symbol))];
  const pricedPositions = positions.filter((position) => Number.isFinite(position.displayCurrentValue) && position.displayCurrentValue > 0);
  const allocationValue = pricedPositions.reduce((sum, position) => sum + position.displayCurrentValue, 0);

  const pieData = pricedPositions.map((position) => ({
    name: position.symbol,
    value: position.displayCurrentValue,
    pct: allocationValue ? (position.displayCurrentValue / allocationValue) * 100 : 0,
  }));
  const assetClassData = Array.from(
    pricedPositions.reduce((groups, position) => {
      const quote = quoteMap.get(position.symbol);
      const assetClass = inferPortfolioAssetClass(position.symbol, quote);
      const existing = groups.get(assetClass) ?? { name: assetClass, value: 0, pct: 0 };
      existing.value += position.displayCurrentValue;
      groups.set(assetClass, existing);
      return groups;
    }, new Map<string, { name: string; value: number; pct: number }>())
  )
    .map(([, value]) => ({
      ...value,
      pct: allocationValue ? (value.value / allocationValue) * 100 : 0,
    }))
    .sort((left, right) => right.value - left.value);

  const handleSort = (nextSortKey: PortfolioSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection('asc');
  };

  const renderSortIcon = (key: PortfolioSortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  };

  const handleHistoryTimeframeChange = (option: (typeof PORTFOLIO_HISTORY_TIMEFRAMES)[number]) => {
    setHistoryRange(option.range);
    setHistoryLookbackDays(option.lookbackDays);
  };

  const handleSelectAllHistorySymbols = () => {
    setHistorySelectionMode('all');
    setSelectedHistorySymbols([]);
  };

  const handleClearHistorySymbols = () => {
    setHistorySelectionMode('none');
    setSelectedHistorySymbols([]);
  };

  const toggleHistorySymbol = (symbol: string) => {
    const currentlyAll = historySelectionMode === 'all';
    if (currentlyAll) {
      const explicitSelection = positions
        .map((position) => position.symbol)
        .filter((value) => value !== symbol);
      setHistorySelectionMode(explicitSelection.length ? 'custom' : 'none');
      setSelectedHistorySymbols(explicitSelection);
      return;
    }

    if (historySelectionMode === 'none') {
      setHistorySelectionMode('custom');
      setSelectedHistorySymbols([symbol]);
      return;
    }

    setSelectedHistorySymbols((current) => {
      const nextSelection = current.includes(symbol)
        ? current.filter((value) => value !== symbol)
        : [...current, symbol];

      setHistorySelectionMode(nextSelection.length ? 'custom' : 'none');
      return nextSelection;
    });
  };

  const handleExpandAllLots = () => {
    setExpandedSymbols(positions.map((position) => position.symbol));
  };

  const handleCollapseAllLots = () => {
    setExpandedSymbols([]);
  };

  const handleConfirmClearPortfolio = () => {
    clearPortfolio();
    setExpandedSymbols([]);
    setSelectedHistorySymbols([]);
    setHistorySelectionMode('all');
    setShowClearPortfolioConfirm(false);
    setImportFeedback({
      tone: 'warning',
      message: 'Portfolio cleared. All lots and derived portfolio history were removed from local storage.',
    });
  };

  const handleExportCsv = () => {
    if (!lots.length) return;

    const header = [
      'Symbol',
      'Name',
      'Asset Class',
      'Currency',
      'Shares',
      'Average Cost',
      'Purchase Date',
      'Added At',
      'Current Price',
      'Current Value',
      'Gain/Loss',
      'Gain/Loss %',
    ];

    const rows = lots.map((lot) => {
      const quote = quoteMap.get(lot.symbol);
      return [
        lot.symbol,
        lot.shortName,
        inferPortfolioAssetClass(lot.symbol, quote),
        lot.currency,
        lot.shares,
        lot.avgCost,
        lot.purchaseDate,
        lot.addedAt,
        lot.currentPrice,
        lot.currentValue,
        lot.gainLoss,
        lot.gainLossPct,
      ].map(escapeCsvCell).join(',');
    });

    const content = [header.map(escapeCsvCell).join(','), ...rows].join('\n');
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`portfolio-export-${dateStamp}.csv`, content);
  };

  const resetAddForm = (nextSymbol = '') => {
    const normalizedSymbol = nextSymbol.trim().toUpperCase();
    setSymbolInput(normalizedSymbol);
    setAddCurrency(assetCurrencyMap.get(normalizedSymbol) ?? DEFAULT_PORTFOLIO_CURRENCY);
    setLotDrafts([createLotDraft()]);
    setShowSuggestions(false);
  };

  const closeAddForm = () => {
    setShowAdd(false);
    resetAddForm();
  };

  const closeEditForm = () => {
    setEditingLot(null);
    setShowEditSuggestions(false);
  };

  const scrollToPortfolioTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAddForm = (nextSymbol = '') => {
    const normalizedSymbol = nextSymbol.trim().toUpperCase();
    closeEditForm();
    resetAddForm(normalizedSymbol);
    setShowAdd(true);
    setTimeout(() => {
      scrollToPortfolioTop();
      if (normalizedSymbol) {
        sharesInputRef.current?.focus();
        return;
      }
      inputRef.current?.focus();
    }, 0);
  };

  const openEditForm = (lot: PortfolioLot) => {
    closeAddForm();
    setEditingLot({
      id: lot.id,
      symbol: lot.symbol,
      shares: String(lot.shares),
      avgCost: String(lot.avgCost),
      purchaseDate: lot.purchaseDate,
    });
    setShowEditSuggestions(false);
    setTimeout(() => {
      scrollToPortfolioTop();
      editSharesInputRef.current?.focus();
    }, 0);
  };

  const handleSelectSymbol = (symbol?: string) => {
    if (!symbol) return;
    const normalizedSymbol = symbol.toUpperCase();
    setSymbolInput(normalizedSymbol);
    setAddCurrency(assetCurrencyMap.get(normalizedSymbol) ?? addCurrency);
    setShowSuggestions(false);
  };

  const handleSelectEditSymbol = (symbol?: string) => {
    if (!symbol || !editingLot) return;
    setEditingLot({
      ...editingLot,
      symbol: symbol.toUpperCase(),
    });
    setShowEditSuggestions(false);
  };

  const handleAddLotDraft = () => {
    setLotDrafts((current) => [...current, createLotDraft()]);
  };

  const handleRemoveLotDraft = (id: string) => {
    setLotDrafts((current) => {
      if (current.length === 1) return [createLotDraft()];
      return current.filter((lot) => lot.id !== id);
    });
  };

  const handleLotDraftChange = (id: string, field: keyof Omit<LotDraft, 'id'>, value: string) => {
    setLotDrafts((current) =>
      current.map((lot) =>
        lot.id === id
          ? {
              ...lot,
              [field]: value,
            }
          : lot
      )
    );
  };

  const handleEditingLotChange = (field: keyof Omit<EditLotDraft, 'id'>, value: string) => {
    setEditingLot((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current
    );
  };

  const handleAddPositions = () => {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;

    const nextLots = lotDrafts.map(parseLotFields);
    if (!nextLots.length || nextLots.some((lot) => !lot.isValid)) return;

    const currency = normalizePortfolioCurrency(addCurrency);
    const addedAt = new Date().toISOString();
    if (isAddingToExistingPosition) {
      updatePortfolioAssetCurrency(symbol, currency);
    }
    addPortfolioPositions(
      nextLots.map((lot) => ({
        symbol,
        shares: lot.shares,
        avgCost: lot.avgCost,
        currency,
        purchaseDate: lot.purchaseDate,
        addedAt,
      }))
    );

    closeAddForm();
  };

  const handleSaveLotEdit = () => {
    if (!editingLot || !parsedEditingLot?.isValid) return;

    const symbol = editingLot.symbol.trim().toUpperCase();
    if (!symbol) return;

    updatePortfolioPosition(editingLot.id, {
      symbol,
      shares: parsedEditingLot.shares,
      avgCost: parsedEditingLot.avgCost,
      purchaseDate: parsedEditingLot.purchaseDate,
    });

    setExpandedSymbols((current) => (current.includes(symbol) ? current : [...current, symbol]));
    closeEditForm();
  };

  const handleAssetCurrencyChange = (symbol: string, currency: string) => {
    updatePortfolioAssetCurrency(symbol, normalizePortfolioCurrency(currency));
  };

  const openImportPicker = () => {
    fileInputRef.current?.click();
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = importPortfolioCsv(text);
      const addedAt = new Date().toISOString();

      addPortfolioPositions(
        result.lots.map((lot) => ({
          ...lot,
          currency: normalizePortfolioCurrency(lot.currency),
          addedAt,
        }))
      );

      const importedSymbols = new Set(result.lots.map((lot) => lot.symbol));
      const importedAssetCount = importedSymbols.size;
      const skippedSuffix = result.skippedRows
        ? ` Skipped ${result.skippedRows} row${result.skippedRows === 1 ? '' : 's'} with unsupported transactions or incomplete lot data.`
        : '';

      setImportFeedback({
        tone: result.skippedRows > 0 ? 'warning' : 'success',
        message: `Imported ${result.lots.length} lot${result.lots.length === 1 ? '' : 's'} across ${importedAssetCount} symbol${importedAssetCount === 1 ? '' : 's'} from ${result.sourceLabel}. Lots without a CSV currency column defaulted to USD.${skippedSuffix}`,
      });
    } catch (error) {
      setImportFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to import the selected CSV file.',
      });
    } finally {
      event.target.value = '';
      scrollToPortfolioTop();
    }
  };

  const toggleExpanded = (symbol: string) => {
    setExpandedSymbols((current) =>
      current.includes(symbol) ? current.filter((value) => value !== symbol) : [...current, symbol]
    );
  };

  const importFeedbackStyles = importFeedback?.tone === 'success'
    ? 'border-terminal-positive/30 bg-terminal-positive/10 text-terminal-positive'
    : importFeedback?.tone === 'warning'
      ? 'border-terminal-accent/30 bg-terminal-accent/10 text-terminal-accent'
      : 'border-terminal-negative/30 bg-terminal-negative/10 text-terminal-negative';
  const allLotsExpanded = positions.length > 0 && positions.every((position) => expandedSymbols.includes(position.symbol));

  return <>
    <WorkspaceHeader title="PORTFOLIO TRACKER">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportCsv}
        className="hidden"
      />
      <button
        onClick={openImportPicker}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-panel border border-terminal-border text-terminal-muted rounded text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
      >
        <Upload size={12} />
        IMPORT CSV
      </button>
      <button
        onClick={handleExportCsv}
        disabled={positions.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-panel border border-terminal-border text-terminal-muted rounded text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download size={12} />
        EXPORT CSV
      </button>
      <button
        onClick={() => {
          setShowClearPortfolioConfirm(true);
          scrollToPortfolioTop();
        }}
        disabled={portfolio.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-panel border border-terminal-negative/30 text-terminal-negative rounded text-xs hover:bg-terminal-negative/10 hover:border-terminal-negative/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash2 size={12} />
        CLEAR PORTFOLIO
      </button>
      <button
        onClick={() => (showAdd ? closeAddForm() : openAddForm())}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-accent/20 border border-terminal-accent/40 text-terminal-accent rounded text-xs hover:bg-terminal-accent/30 transition-colors"
      >
        <Plus size={12} />
        ADD POSITION
      </button>
    </WorkspaceHeader>
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
      {showClearPortfolioConfirm && (
        <div className="rounded border border-terminal-negative/40 bg-terminal-negative/10 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-terminal-negative text-xs font-bold tracking-wider">CLEAR ENTIRE PORTFOLIO?</div>
              <div className="text-terminal-faint text-xs mt-1 leading-relaxed">
                This will permanently remove all {portfolio.length} lot{portfolio.length === 1 ? '' : 's'} from your locally stored portfolio, along with the derived portfolio history and chart selections. This action cannot be undone.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirmClearPortfolio}
                className="px-3 py-1.5 bg-terminal-negative/20 border border-terminal-negative/40 text-terminal-negative text-xs rounded hover:bg-terminal-negative/30 transition-colors"
              >
                CONFIRM CLEAR
              </button>
              <button
                onClick={() => setShowClearPortfolioConfirm(false)}
                className="px-3 py-1.5 bg-terminal-panel border border-terminal-border text-terminal-muted text-xs rounded hover:bg-terminal-hover"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {importFeedback && (
        <div className={`rounded border px-3 py-2 text-xs ${importFeedbackStyles}`}>
          {importFeedback.message}
        </div>
      )}

      {editingLot && (
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3 animate-fade-in">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-terminal-muted text-xs font-bold tracking-wider">
                EDIT LOT - {editingLot.symbol.trim().toUpperCase() || 'UNASSIGNED'}
              </div>
              <div className="text-terminal-faint text-xs mt-1">
                Update the lot details below. Imported and manually added lots use the same editor.
              </div>
            </div>
            <button
              onClick={closeEditForm}
              className="px-2.5 py-1 border border-terminal-border rounded text-terminal-muted text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover"
            >
              CLOSE
            </button>
          </div>

          <div className="relative">
            <label className="text-terminal-faint text-xs block mb-1">SYMBOL</label>
            <input
              ref={editInputRef}
              value={editingLot.symbol}
              onChange={(event) => {
                const value = event.target.value.toUpperCase();
                handleEditingLotChange('symbol', value);
                setShowEditSuggestions(value.length >= 1);
              }}
              onBlur={() => setTimeout(() => setShowEditSuggestions(false), 150)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSaveEdit) handleSaveLotEdit();
                if (event.key === 'Escape') closeEditForm();
              }}
              placeholder="AAPL or company name"
              className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
            />
            {showEditSuggestions && editSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 bg-terminal-elevated border border-terminal-border rounded shadow-xl mt-0.5 max-h-52 overflow-y-auto">
                {editSuggestions.map((result) => (
                  <button
                    key={`${result.symbol}-${result.exchDisp ?? 'exchange'}-edit`}
                    onMouseDown={() => handleSelectEditSymbol(result.symbol)}
                    className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-terminal-hover text-left border-b border-terminal-border/40 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="text-terminal-accent font-bold text-xs">{result.symbol}</div>
                      <div className="text-terminal-faint text-xs truncate">{result.shortname ?? result.longname}</div>
                    </div>
                    <span className="text-terminal-faint text-xs flex-shrink-0 ml-1">{result.typeDisp}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-[1.1fr_1.1fr_1.1fr] gap-2">
            <div>
              <label className="text-terminal-faint text-xs block mb-1">SHARES</label>
              <input
                ref={editSharesInputRef}
                value={editingLot.shares}
                onChange={(event) => handleEditingLotChange('shares', event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && canSaveEdit && handleSaveLotEdit()}
                placeholder="100"
                inputMode="decimal"
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
              />
            </div>
            <div>
              <label className="text-terminal-faint text-xs block mb-1">
                PURCHASE PRICE ({assetCurrencyMap.get(normalizePortfolioSymbol(editingLot.symbol)) ?? DEFAULT_PORTFOLIO_CURRENCY})
              </label>
              <input
                value={editingLot.avgCost}
                onChange={(event) => handleEditingLotChange('avgCost', event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && canSaveEdit && handleSaveLotEdit()}
                placeholder="150.00"
                inputMode="decimal"
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
              />
            </div>
            <div>
              <label className="text-terminal-faint text-xs block mb-1">PURCHASE DATE</label>
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={editingLot.purchaseDate}
                onChange={(event) => handleEditingLotChange('purchaseDate', event.target.value)}
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-[0.43rem] text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="text-terminal-faint text-xs">
              Save changes to update cost basis and portfolio P&amp;L immediately.
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveLotEdit}
                disabled={!canSaveEdit}
                className="px-3 py-1 bg-terminal-positive/20 border border-terminal-positive/40 text-terminal-positive text-xs rounded hover:bg-terminal-positive/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                SAVE LOT
              </button>
              <button
                onClick={closeEditForm}
                className="px-3 py-1 bg-terminal-panel border border-terminal-border text-terminal-muted text-xs rounded hover:bg-terminal-hover"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3 animate-fade-in">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-terminal-muted text-xs font-bold tracking-wider">
                {isAddingToExistingPosition ? `ADD LOT - ${currentFormSymbol}` : 'NEW POSITION'}
              </div>
              <div className="text-terminal-faint text-xs mt-1">
                {isAddingToExistingPosition
                  ? 'Record each additional buy as a dated lot. Portfolio P&L updates automatically across all lots.'
                  : 'Queue one or more lots for the same symbol. Portfolio P&amp;L is aggregated automatically.'}
              </div>
            </div>
            <button
              onClick={handleAddLotDraft}
              className="flex items-center gap-1 px-2.5 py-1 border border-terminal-border rounded text-terminal-muted text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover"
            >
              <Plus size={10} />
              ADD LOT
            </button>
          </div>

          <div className="relative">
            <label className="text-terminal-faint text-xs block mb-1">SYMBOL</label>
            <input
              ref={inputRef}
              autoFocus
              value={symbolInput}
              onChange={(event) => {
                const value = event.target.value.toUpperCase();
                setSymbolInput(value);
                const existingCurrency = assetCurrencyMap.get(value.trim().toUpperCase());
                if (existingCurrency) setAddCurrency(existingCurrency);
                setShowSuggestions(value.length >= 1);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) handleAddPositions();
                if (event.key === 'Escape') closeAddForm();
              }}
              placeholder="AAPL or company name"
              className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
            />
            {isAddingToExistingPosition && (
              <div className="text-terminal-faint text-[11px] mt-1">
                Existing holding detected. New lots will be merged into the current {currentFormSymbol} position.
              </div>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 bg-terminal-elevated border border-terminal-border rounded shadow-xl mt-0.5 max-h-52 overflow-y-auto">
                {suggestions.map((result) => (
                  <button
                    key={`${result.symbol}-${result.exchDisp ?? 'exchange'}`}
                    onMouseDown={() => handleSelectSymbol(result.symbol)}
                    className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-terminal-hover text-left border-b border-terminal-border/40 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="text-terminal-accent font-bold text-xs">{result.symbol}</div>
                      <div className="text-terminal-faint text-xs truncate">{result.shortname ?? result.longname}</div>
                    </div>
                    <span className="text-terminal-faint text-xs flex-shrink-0 ml-1">{result.typeDisp}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 max-w-xs">
            <label className="text-terminal-faint text-xs block mb-1">ASSET CURRENCY</label>
            <select
              value={addCurrency}
              onChange={(event) => setAddCurrency(event.target.value)}
              className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-[0.43rem] text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
            >
              {currencyOptions.map((currency) => (
                <option key={`add-${currency}`} value={currency}>{currency}</option>
              ))}
            </select>
            {isAddingToExistingPosition && (
              <div className="text-terminal-faint text-[11px] mt-1">
                Saving with a different currency will update every {currentFormSymbol} lot.
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <div className="hidden md:grid md:grid-cols-[1.1fr_1.1fr_1.1fr_auto] gap-2 px-1">
              <span className="text-terminal-faint text-[11px] tracking-wide">SHARES</span>
              <span className="text-terminal-faint text-[11px] tracking-wide">PURCHASE PRICE ({addCurrency})</span>
              <span className="text-terminal-faint text-[11px] tracking-wide">PURCHASE DATE</span>
              <span className="text-terminal-faint text-[11px] tracking-wide text-right">LOT</span>
            </div>

            {lotDrafts.map((lot, index) => (
              <div key={lot.id} className="grid grid-cols-1 md:grid-cols-[1.1fr_1.1fr_1.1fr_auto] gap-2">
                <div>
                  <label className="text-terminal-faint text-xs block mb-1 md:hidden">SHARES</label>
                  <input
                    ref={index === 0 ? sharesInputRef : undefined}
                    value={lot.shares}
                    onChange={(event) => handleLotDraftChange(lot.id, 'shares', event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && canSubmit && handleAddPositions()}
                    placeholder="100"
                    inputMode="decimal"
                    className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
                  />
                </div>
                <div>
                  <label className="text-terminal-faint text-xs block mb-1 md:hidden">PURCHASE PRICE ({addCurrency})</label>
                  <input
                    value={lot.avgCost}
                    onChange={(event) => handleLotDraftChange(lot.id, 'avgCost', event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && canSubmit && handleAddPositions()}
                    placeholder="150.00"
                    inputMode="decimal"
                    className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
                  />
                </div>
                <div>
                  <label className="text-terminal-faint text-xs block mb-1 md:hidden">PURCHASE DATE</label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={lot.purchaseDate}
                    onChange={(event) => handleLotDraftChange(lot.id, 'purchaseDate', event.target.value)}
                    className="w-full bg-terminal-elevated border border-terminal-border rounded px-2 py-[0.43rem] text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
                  />
                </div>
                <div className="flex items-end justify-end">
                  <button
                    onClick={() => handleRemoveLotDraft(lot.id)}
                    className="flex items-center gap-1 px-2 py-1.5 border border-terminal-border rounded text-terminal-faint text-xs hover:text-terminal-negative hover:border-terminal-negative/40 hover:bg-terminal-hover"
                    title={`Remove lot ${index + 1}`}
                  >
                    <Trash2 size={10} />
                    <span className="hidden lg:inline">REMOVE</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="text-terminal-faint text-xs">
              {validDraftCount}/{lotDrafts.length} lot{lotDrafts.length === 1 ? '' : 's'} ready
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddPositions}
                disabled={!canSubmit}
                className="px-3 py-1 bg-terminal-positive/20 border border-terminal-positive/40 text-terminal-positive text-xs rounded hover:bg-terminal-positive/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ADD LOTS
              </button>
              <button
                onClick={closeAddForm}
                className="px-3 py-1 bg-terminal-panel border border-terminal-border text-terminal-muted text-xs rounded hover:bg-terminal-hover"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <DollarSign size={32} className="text-terminal-faint mb-3" />
          <div className="text-terminal-muted text-sm">No positions yet</div>
          <div className="text-terminal-faint text-xs mt-1">
            Add one or more dated lots manually, or import a CSV from Yahoo Finance to load existing holdings.
          </div>
        </div>
      ) : (
        <div className="section-stack section-columns-xl grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="section-stack xl:col-span-2 space-y-3">
            <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="instrument-heading text-terminal-muted text-xs font-bold tracking-wider">VALUE DISPLAY</div>
                  <div className="text-terminal-faint text-xs mt-1">
                    {portfolioValueMode === 'aggregate'
                      ? `Aggregated totals use the latest available FX rates into ${displayCurrency}.`
                      : 'Totals are separated by each asset currency.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded border border-terminal-border overflow-hidden">
                    <button
                      onClick={() => setPortfolioValueMode('aggregate')}
                      className={`px-3 py-1.5 text-xs transition-colors ${
                        portfolioValueMode === 'aggregate'
                          ? 'bg-terminal-accent/20 text-terminal-accent'
                          : 'text-terminal-faint hover:text-terminal-accent hover:bg-terminal-hover'
                      }`}
                    >
                      AGGREGATE
                    </button>
                    <button
                      onClick={() => setPortfolioValueMode('byCurrency')}
                      className={`px-3 py-1.5 text-xs border-l border-terminal-border transition-colors ${
                        portfolioValueMode === 'byCurrency'
                          ? 'bg-terminal-accent/20 text-terminal-accent'
                          : 'text-terminal-faint hover:text-terminal-accent hover:bg-terminal-hover'
                      }`}
                    >
                      BY CURRENCY
                    </button>
                  </div>
                  <select
                    value={displayCurrency}
                    onChange={(event) => setPortfolioDisplayCurrency(event.target.value)}
                    disabled={portfolioValueMode !== 'aggregate'}
                    className="bg-terminal-elevated border border-terminal-border rounded px-2 py-1.5 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50 disabled:opacity-50"
                  >
                    {currencyOptions.map((currency) => (
                      <option key={`display-${currency}`} value={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
              </div>
              {missingQuoteSymbols.length > 0 && (
                <div className="mt-2 rounded border border-terminal-accent/30 bg-terminal-accent/5 px-2 py-1.5 text-xs text-terminal-muted" role="status">
                  {refreshingQuotes ? 'Fetching quotes' : 'Quotes unavailable'}: {missingQuoteSymbols.join(', ')}. Current totals are unavailable until all selected prices are known; purchase cost is not a substitute for a quote. Allocation shows priced assets only.
                  {!refreshingQuotes && <button className="ml-2 text-terminal-accent hover:underline" onClick={() => void refetchQuotes()}>RETRY QUOTES</button>}
                </div>
              )}
              {quoteError && missingQuoteSymbols.length === 0 && <div className="mt-2 text-xs text-terminal-muted" role="status">Quote refresh failed. Showing the last available quotes.</div>}
              {portfolioValueMode === 'aggregate' && missingFxCurrencies.length > 0 && (
                <div className="mt-2 rounded border border-terminal-negative/30 bg-terminal-negative/10 px-2 py-1.5 text-xs text-terminal-negative">
                  Missing FX rates for {missingFxCurrencies.join(', ')} to {displayCurrency}; aggregated totals are unavailable until those rates are known. Allocation shows only covered assets.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">TOTAL VALUE</div>
                {portfolioValueMode === 'aggregate' ? (
                  <div className="instrument-value text-terminal-text font-bold text-xl tabular-nums">{formatCurrencyAmount(totalValue, displayCurrency, 2)}</div>
                ) : (
                  <div className="space-y-1">
                    {totalsByCurrency.map((total) => (
                      <div key={`value-${total.currency}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-terminal-faint">{total.currency}</span>
                        <span className="text-terminal-text font-bold tabular-nums">{formatCurrencyAmount(total.currentValue, total.currency, 2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-terminal-faint text-[10px] mt-1">ALL ASSETS</div>
              </div>
              <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">TOTAL COST</div>
                {portfolioValueMode === 'aggregate' ? (
                  <div className="instrument-value text-terminal-text font-bold text-xl tabular-nums">{formatCurrencyAmount(totalCost, displayCurrency, 2)}</div>
                ) : (
                  <div className="space-y-1">
                    {totalsByCurrency.map((total) => (
                      <div key={`cost-${total.currency}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-terminal-faint">{total.currency}</span>
                        <span className="text-terminal-text font-bold tabular-nums">{formatCurrencyAmount(total.totalCost, total.currency, 2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-terminal-faint text-[10px] mt-1">ALL ASSETS</div>
              </div>
              <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">TOTAL P&amp;L</div>
                {portfolioValueMode === 'aggregate' ? (
                  <div className={`instrument-value font-bold text-xl tabular-nums ${changeColor(totalGainLoss)}`}>
                    {formatCurrencyAmount(totalGainLoss, displayCurrency, 2)} <span className="font-mono text-sm">({fmt.pct(totalGainLossPct)})</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {totalsByCurrency.map((total) => (
                      <div key={`pnl-${total.currency}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-terminal-faint">{total.currency}</span>
                        <span className={`font-bold tabular-nums ${changeColor(total.gainLoss)}`}>
                          {formatCurrencyAmount(total.gainLoss, total.currency, 2)} ({fmt.pct(total.gainLossPct)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-terminal-faint text-[10px] mt-1">ALL ASSETS</div>
              </div>
              <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">ASSETS / LOTS</div>
                <div className="instrument-value text-terminal-text font-bold text-xl tabular-nums">
                  {positions.length} / {totalLots}
                </div>
              </div>
            </div>

            <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="instrument-heading text-terminal-muted text-xs font-bold tracking-wider">HISTORICAL HOLDINGS VALUE</div>
                  <div className="text-terminal-faint text-xs mt-1">
                    Recorded holdings valued at historical closes in {displayCurrency}, using today’s FX rates. Purchases affect value; this is not a total-return chart.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => setShowCostBasis((current) => !current)}
                    aria-pressed={showCostBasis}
                    className={`px-2 py-1 text-[11px] rounded border ${showCostBasis ? 'border-terminal-blue/40 bg-terminal-blue/15 text-terminal-blue' : 'border-terminal-border text-terminal-faint hover:text-terminal-text'}`}
                  >
                    COST BASIS
                  </button>
                  <button
                    aria-pressed={showMarketBenchmark}
                    onClick={() => setShowMarketBenchmark((current) => !current)}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      showMarketBenchmark
                        ? 'border-terminal-purple/40 bg-terminal-purple/15 text-terminal-purple'
                        : 'border-terminal-border text-terminal-faint hover:text-terminal-purple hover:border-terminal-purple/30 hover:bg-terminal-hover'
                    }`}
                    title={`Overlay ${MARKET_BENCHMARK_LABEL} on its own right-side scale`}
                  >
                    {MARKET_BENCHMARK_LABEL}
                  </button>
                  {PORTFOLIO_HISTORY_TIMEFRAMES.map((option) => (
                    <button
                      key={`${option.label}-${option.range}-${option.lookbackDays ?? 'full'}`}
                      onClick={() => handleHistoryTimeframeChange(option)}
                      className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                        historyRange === option.range && historyLookbackDays === option.lookbackDays
                          ? 'border-terminal-accent/40 bg-terminal-accent/20 text-terminal-accent'
                          : 'border-terminal-border text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/30 hover:bg-terminal-hover'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <div className="text-terminal-faint text-[10px] tracking-[0.18em] mb-1.5">
                  CHART ASSETS {historySelectionMode === 'all' ? '(ALL)' : historySelectionMode === 'none' ? '(NONE)' : `(${effectiveHistorySymbols.length}/${positions.length})`}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={handleSelectAllHistorySymbols}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      historySelectionMode === 'all'
                        ? 'border-terminal-accent/40 bg-terminal-accent/20 text-terminal-accent'
                        : 'border-terminal-border text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/30 hover:bg-terminal-hover'
                    }`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={handleClearHistorySymbols}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                      historySelectionMode === 'none'
                        ? 'border-terminal-accent/40 bg-terminal-accent/20 text-terminal-accent'
                        : 'border-terminal-border text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/30 hover:bg-terminal-hover'
                    }`}
                  >
                    NONE
                  </button>
                  {positions.map((position) => {
                    const isSelected = effectiveHistorySymbols.includes(position.symbol);
                    return (
                      <button
                        key={position.symbol}
                        onClick={() => toggleHistorySymbol(position.symbol)}
                        className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                          isSelected
                            ? 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent'
                            : 'border-terminal-border text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/30 hover:bg-terminal-hover'
                        }`}
                      >
                        {position.symbol}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3">
                {portfolioHistory.length === 0 && (loadingHistory || loadingFxRates || refreshingQuotes) ? (
                  <div className="instrument-section flex h-[280px] items-center justify-center rounded border border-terminal-border text-terminal-muted text-xs" role="status">
                    Loading historical closes{historyFxMissing.length ? ' and FX rates' : ''}{refreshingQuotes ? ' and quote units' : ''}…
                  </div>
                ) : portfolioHistory.length === 0 ? (
                  <div className="instrument-section flex h-[280px] items-center justify-center rounded border border-terminal-border/70 bg-terminal-elevated/30 text-terminal-faint text-xs">
                    {historySelectionMode === 'none' ? 'Select at least one asset to show its history.' : 'No usable price history is available for the selected assets and period.'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={portfolioChartData} margin={{ top: 8, right: showMarketBenchmark && hasMarketBenchmarkData ? 24 : 12, left: 12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="portfolio-value-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={themePalette.accent} stopOpacity={0.32} />
                          <stop offset="100%" stopColor={themePalette.accent} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={themePalette.chartGrid} strokeDasharray="1 4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: themePalette.muted, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: themePalette.border }}
                        minTickGap={18}
                      />
                      <YAxis
                        yAxisId="value"
                        domain={valueAxisScale.domain}
                        allowDataOverflow
                        ticks={valueAxisScale.ticks}
                        label={{ value: `VALUE (${displayCurrency})`, angle: -90, position: 'insideLeft', fill: themePalette.muted, fontSize: 10, dx: 8 }}
                        tick={{ fill: themePalette.muted, fontSize: 11 }}
                        tickFormatter={(value: number) => formatRoundedCurrencyAxisTick(value, valueAxisScale.step, displayCurrency)}
                        tickLine={false}
                        axisLine={false}
                        width={86}
                      />
                      {showMarketBenchmark && hasMarketBenchmarkData && (
                        <YAxis
                          yAxisId="benchmark"
                          orientation="right"
                          domain={benchmarkAxisScale.domain}
                          allowDataOverflow
                          ticks={benchmarkAxisScale.ticks}
                          label={{ value: MARKET_BENCHMARK_LABEL, angle: 90, position: 'insideRight', fill: themePalette.purple, fontSize: 10, dx: -6 }}
                          tick={{ fill: themePalette.purple, fontSize: 11 }}
                          tickFormatter={(value: number) => formatRoundedNumberAxisTick(value, benchmarkAxisScale.step)}
                          tickLine={false}
                          axisLine={{ stroke: themePalette.purple, strokeOpacity: 0.65 }}
                          width={82}
                        />
                      )}
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === MARKET_BENCHMARK_LABEL) return [fmt.price(value, 2), name];
                          return [formatCurrencyAmount(value, displayCurrency, 2), name];
                        }}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as PortfolioHistoryPoint | undefined;
                          return point
                            ? new Date(point.timestamp).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
                            : '';
                        }}
                        contentStyle={{ background: themePalette.elevated, border: `1px solid ${themePalette.border}`, borderRadius: '4px', fontSize: '11px' }}
                        labelStyle={{ color: themePalette.text }}
                        itemStyle={{ color: themePalette.muted }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', color: themePalette.muted, strokeLinecap: 'round' }} />
                      <Area
                        type="linear"
                        baseValue={valueAxisScale.domain[0]}
                        dataKey="value"
                        name="Portfolio Value"
                        stroke={themePalette.accent}
                        strokeWidth={2}
                        strokeDasharray="0.1 3.6"
                        strokeLinecap="round"
                        legendType="plainline"
                        fill="url(#portfolio-value-fill)"
                        dot={portfolioChartData.length === 1 ? { r: 3 } : false}
                        isAnimationActive={false}
                        yAxisId="value"
                      />
                      {showCostBasis && <Line
                        type="stepAfter"
                        dataKey="cost"
                        name="Cost Basis"
                        stroke={themePalette.blue}
                        strokeWidth={1.6}
                        strokeDasharray="5 4"
                        legendType="plainline"
                        dot={false}
                        isAnimationActive={false}
                        yAxisId="value"
                      />}
                      {showMarketBenchmark && hasMarketBenchmarkData && (
                        <Line
                          type="linear"
                          dataKey="benchmarkClose"
                          name={MARKET_BENCHMARK_LABEL}
                          stroke={themePalette.purple}
                          strokeWidth={1.8}
                          strokeDasharray="3 3"
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                          legendType="plainline"
                          yAxisId="benchmark"
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 text-terminal-faint text-[11px] leading-relaxed">
                  {portfolioChartData.length === 1 ? 'Only one historical observation is available. ' : ''}Axis fits the visible values and does not start at zero. Historical FX, dividends, fees, and closed positions are not included.
                  {showMarketBenchmark && ' S&P 500 uses index points on a separate right axis; line slopes are not directly comparable returns.'}
                </div>
                {(missingHistorySymbols.length > 0 || historyFxMissing.length > 0) && (
                  <div className="mt-2 rounded border border-terminal-accent/30 bg-terminal-accent/5 px-2 py-1.5 text-xs text-terminal-muted" role="status">
                    {portfolioHistory.length > 0 ? 'Partial chart. ' : ''}
                    {missingHistorySymbols.length > 0 && `${loadingHistory ? 'Still loading or unavailable' : 'Unavailable'} history: ${missingHistorySymbols.join(', ')}. `}
                    {historyFxMissing.length > 0 && `Excluded until FX is available: ${historyFxMissing.join(', ')}. `}
                    {portfolioHistory.length > 0 && 'Only covered assets are plotted.'}
                    {!refreshingHistory && missingHistorySymbols.length > 0 && (
                      <button className="ml-2 text-terminal-accent hover:underline" onClick={() => historyQueries.forEach((query) => { if (!query.data?.points.length) void query.refetch(); })}>RETRY HISTORY</button>
                    )}
                  </div>
                )}
                {refreshingHistory && portfolioHistory.length > 0 && <div className="mt-1 text-xs text-terminal-faint" role="status">Loading or refreshing remaining history…</div>}
                {showMarketBenchmark && loadingMarketBenchmark && (
                  <div className="text-terminal-faint text-[11px] mt-1">Loading {MARKET_BENCHMARK_LABEL} overlay...</div>
                )}
                {showMarketBenchmark && !loadingMarketBenchmark && !hasMarketBenchmarkData && (
                  <div className="text-terminal-faint text-[11px] mt-1">{MARKET_BENCHMARK_LABEL} overlay is unavailable for this timeframe.</div>
                )}
              </div>
            </div>

            <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
              <div className="instrument-section flex items-center justify-between gap-3 px-3 py-2 border-b border-terminal-border/60 bg-terminal-elevated/40">
                <div>
                  <div className="instrument-heading text-terminal-muted text-xs font-bold tracking-wider">POSITIONS & LOTS</div>
                  <div className="text-terminal-faint text-[11px] mt-0.5">
                    Expand holdings to inspect or edit lot-level entries.
                  </div>
                </div>
                <button
                  onClick={allLotsExpanded ? handleCollapseAllLots : handleExpandAllLots}
                  disabled={positions.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-terminal-panel border border-terminal-border text-terminal-muted rounded text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {allLotsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {allLotsExpanded ? 'COLLAPSE ALL LOTS' : 'EXPAND ALL LOTS'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left">
                        <button onClick={() => handleSort('symbol')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          SYMBOL {renderSortIcon('symbol')}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => handleSort('lotCount')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          LOTS {renderSortIcon('lotCount')}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => handleSort('shares')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          SHARES {renderSortIcon('shares')}
                        </button>
                      </th>
                      <th>CURRENCY</th>
                      <th>
                        <button onClick={() => handleSort('avgCost')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          AVG COST {renderSortIcon('avgCost')}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => handleSort('currentPrice')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          CUR PRICE {renderSortIcon('currentPrice')}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => handleSort('currentValue')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          CUR VALUE {renderSortIcon('currentValue')}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => handleSort('gainLoss')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          P&amp;L {renderSortIcon('gainLoss')}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => handleSort('gainLossPct')} className="inline-flex items-center gap-1 hover:text-terminal-accent">
                          P&amp;L % {renderSortIcon('gainLossPct')}
                        </button>
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => {
                      const isExpanded = expandedSymbols.includes(position.symbol);

                      return (
                        <Fragment key={position.symbol}>
                          <tr>
                            <td>
                              <button
                                onClick={() => setActivePanel('equity', position.symbol)}
                                className="text-terminal-accent font-bold hover:underline"
                              >
                                {position.symbol}
                              </button>
                              <div className="text-terminal-faint text-xs truncate max-w-36">{position.shortName}</div>
                            </td>
                            <td className="tabular-nums">{position.lotCount}</td>
                            <td className="tabular-nums">{formatShares(position.shares)}</td>
                            <td>
                              <select
                                value={position.currency}
                                onChange={(event) => handleAssetCurrencyChange(position.symbol, event.target.value)}
                                className="bg-terminal-elevated border border-terminal-border rounded px-1.5 py-1 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
                                title={`Currency for all ${position.symbol} lots`}
                              >
                                {currencyOptions.map((currency) => (
                                  <option key={`${position.symbol}-${currency}`} value={currency}>{currency}</option>
                                ))}
                              </select>
                            </td>
                            <td className="tabular-nums">{formatCurrencyAmount(position.avgCost, position.currency, 2)}</td>
                            <td className="tabular-nums">{formatCurrencyAmount(position.currentPrice, position.currency, 2)}</td>
                            <td className="tabular-nums font-bold">{formatCurrencyAmount(position.currentValue, position.currency, 2)}</td>
                            <td className={`tabular-nums ${changeColor(position.gainLoss)}`}>{formatCurrencyAmount(position.gainLoss, position.currency, 2)}</td>
                            <td className={`tabular-nums font-bold ${changeColor(position.gainLossPct)}`}>
                              <div className="flex items-center gap-1 justify-end">
                                {position.gainLossPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {fmt.pct(position.gainLossPct)}
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openAddForm(position.symbol)}
                                  className="flex items-center gap-1 px-2 py-1 border border-terminal-border rounded text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover"
                                  title={`Add lot to ${position.symbol}`}
                                >
                                  <Plus size={10} />
                                  <span className="hidden lg:inline">LOT</span>
                                </button>
                                <button
                                  onClick={() => toggleExpanded(position.symbol)}
                                  className="flex items-center gap-1 text-terminal-faint hover:text-terminal-accent p-1"
                                  title={isExpanded ? 'Hide lots' : 'Show lots'}
                                >
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={10} className="instrument-section bg-terminal-elevated/50 px-3 py-3">
                                <div className="instrument-section rounded border border-terminal-border overflow-hidden">
                                  <div className="instrument-section px-3 py-2 panel-border-b bg-terminal-panel/80 flex items-center justify-between gap-3">
                                    <span className="text-terminal-muted text-xs font-bold tracking-wider">
                                      {position.symbol} LOTS - {position.currency}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-terminal-faint text-xs">
                                        Lot-level cost basis and P&amp;L
                                      </span>
                                      <button
                                        onClick={() => openAddForm(position.symbol)}
                                        className="flex items-center gap-1 px-2 py-1 border border-terminal-border rounded text-terminal-faint hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover"
                                      >
                                        <Plus size={10} />
                                        ADD LOT
                                      </button>
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-terminal-faint border-b border-terminal-border/50">
                                          <th className="text-left px-3 py-2 font-normal tracking-wide">PURCHASE DATE</th>
                                          <th className="text-right px-3 py-2 font-normal tracking-wide">SHARES</th>
                                          <th className="text-right px-3 py-2 font-normal tracking-wide">COST / SHR</th>
                                          <th className="text-right px-3 py-2 font-normal tracking-wide">COST BASIS</th>
                                          <th className="text-right px-3 py-2 font-normal tracking-wide">CUR VALUE</th>
                                          <th className="text-right px-3 py-2 font-normal tracking-wide">P&amp;L</th>
                                          <th className="px-3 py-2"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {position.lots.map((lot) => (
                                          <tr key={lot.id} className="border-b border-terminal-border/30 last:border-0">
                                            <td className="px-3 py-2 text-terminal-text">{formatPortfolioDate(lot.purchaseDate)}</td>
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">{formatShares(lot.shares)}</td>
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">{formatCurrencyAmount(lot.avgCost, lot.currency, 2)}</td>
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">{formatCurrencyAmount(lot.totalCost, lot.currency, 2)}</td>
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">{formatCurrencyAmount(lot.currentValue, lot.currency, 2)}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${changeColor(lot.gainLoss)}`}>
                                              {formatCurrencyAmount(lot.gainLoss, lot.currency, 2)} ({fmt.pct(lot.gainLossPct)})
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                              <div className="flex items-center justify-end gap-1">
                                                <button
                                                  onClick={() => openEditForm(lot)}
                                                  className="text-terminal-faint hover:text-terminal-accent p-1"
                                                  title="Edit lot"
                                                >
                                                  <Pencil size={11} />
                                                </button>
                                                <button
                                                  onClick={() => removePortfolioPosition(lot.id)}
                                                  className="text-terminal-faint hover:text-terminal-negative p-1"
                                                  title="Remove lot"
                                                >
                                                  <Trash2 size={11} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="section-stack space-y-3">
            <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="instrument-heading text-terminal-muted text-xs font-bold tracking-wider mb-3">ALLOCATION BY SYMBOL ({displayCurrency})</div>
              <AllocationChart data={pieData} currency={displayCurrency} mode={mode} palette={themePalette} />
            </div>

            <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="instrument-heading text-terminal-muted text-xs font-bold tracking-wider mb-3">ALLOCATION BY ASSET CLASS ({displayCurrency})</div>
              <AllocationChart data={assetClassData} currency={displayCurrency} mode={mode} palette={themePalette} />
            </div>
          </div>
        </div>
      )}
    </div>
  </>;
}

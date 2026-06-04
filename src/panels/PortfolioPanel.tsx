import { Fragment, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, DollarSign, Download, Pencil, Plus, Trash2, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchChart, fetchQuotes, searchSymbols } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { ChartInterval, ChartPoint, ChartRange, PortfolioPosition, Quote } from '../types';
import { changeColor, fmt } from '../utils/formatters';
import { importPortfolioCsv } from '../utils/portfolioImport';
import { getThemePalette, useTheme } from '../utils/theme';

const COLORS = ['#f0a500', '#58a6ff', '#3fb950', '#d2a8ff', '#f85149', '#ffa657', '#39d353', '#a5d6ff'];

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
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  gainLoss: number;
  gainLossPct: number;
  shortName: string;
};

type GroupedPosition = {
  symbol: string;
  shortName: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
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

type PortfolioHistoryPoint = {
  timestamp: number;
  label: string;
  value: number;
  cost: number;
  gainLoss: number;
  gainLossPct: number;
};

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
  if (Number.isInteger(shares)) return shares.toFixed(0);
  return shares < 1 ? shares.toFixed(4) : shares.toFixed(3);
}

function parseLotFields(lot: LotFields) {
  const shares = parseFloat(lot.shares);
  const avgCost = parseFloat(lot.avgCost);
  const purchaseDate = lot.purchaseDate;
  const isValid = Number.isFinite(shares) && shares > 0 && Number.isFinite(avgCost) && avgCost > 0 && Boolean(purchaseDate);
  return { shares, avgCost, purchaseDate, isValid };
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

function parsePortfolioPurchaseTimestamp(dateText: string): number {
  const parsed = Date.parse(`${dateText}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPortfolioHistoryLabel(timestamp: number, range: ChartRange): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: range === '5y' || range === 'max' ? undefined : 'numeric',
    ...(range === '5y' || range === 'max' ? { year: '2-digit' } : {}),
  }).format(new Date(timestamp));
}

function comparePortfolioRows(
  left: GroupedPosition,
  right: GroupedPosition,
  sortKey: PortfolioSortKey,
  sortDirection: SortDirection
): number {
  const direction = sortDirection === 'asc' ? 1 : -1;

  const leftValue = sortKey === 'symbol' ? left.symbol : left[sortKey];
  const rightValue = sortKey === 'symbol' ? right.symbol : right[sortKey];

  if (typeof leftValue === 'string' && typeof rightValue === 'string') {
    return leftValue.localeCompare(rightValue) * direction;
  }

  return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
}

function buildPortfolioHistory(
  lots: PortfolioLot[],
  chartSeries: Array<{ symbol: string; points: ChartPoint[] }>,
  range: ChartRange,
  fallbackValue: number,
  fallbackCost: number
): PortfolioHistoryPoint[] {
  const normalizedSeries = chartSeries
    .map((series) => ({
      symbol: series.symbol,
      points: [...series.points].sort((left, right) => left.timestamp - right.timestamp),
    }))
    .filter((series) => series.points.length > 0);
  const symbolsWithHistory = new Set(normalizedSeries.map((series) => series.symbol));

  const timeline = Array.from(
    new Set(normalizedSeries.flatMap((series) => series.points.map((point) => point.timestamp)))
  ).sort((left, right) => left - right);

  if (!timeline.length) {
    return fallbackValue > 0
      ? [{
          timestamp: Date.now(),
          label: formatPortfolioHistoryLabel(Date.now(), range),
          value: fallbackValue,
          cost: fallbackCost,
          gainLoss: fallbackValue - fallbackCost,
          gainLossPct: fallbackCost ? ((fallbackValue - fallbackCost) / fallbackCost) * 100 : 0,
        }]
      : [];
  }

  const cursors = new Map<string, number>();
  const latestPrices = new Map<string, number>();
  const purchaseTimestamps = new Map(lots.map((lot) => [lot.id, parsePortfolioPurchaseTimestamp(lot.purchaseDate)]));
  const history: PortfolioHistoryPoint[] = [];

  for (const timestamp of timeline) {
    for (const series of normalizedSeries) {
      let cursor = cursors.get(series.symbol) ?? 0;
      while (cursor < series.points.length && series.points[cursor].timestamp <= timestamp) {
        latestPrices.set(series.symbol, series.points[cursor].close);
        cursor += 1;
      }
      cursors.set(series.symbol, cursor);
    }

    let value = 0;
    let cost = 0;
    let hasActiveLots = false;
    let hasIncompleteCoverage = false;

    for (const lot of lots) {
      if ((purchaseTimestamps.get(lot.id) ?? 0) > timestamp) continue;
      if (!symbolsWithHistory.has(lot.symbol)) continue;
      const price = latestPrices.get(lot.symbol);
      if (price == null) {
        hasIncompleteCoverage = true;
        break;
      }
      hasActiveLots = true;
      value += lot.shares * price;
      cost += lot.shares * lot.avgCost;
    }

    if (!hasActiveLots || hasIncompleteCoverage) continue;

    const gainLoss = value - cost;
    history.push({
      timestamp,
      label: formatPortfolioHistoryLabel(timestamp, range),
      value,
      cost,
      gainLoss,
      gainLossPct: cost ? (gainLoss / cost) * 100 : 0,
    });
  }

  return history.length
    ? history
    : fallbackValue > 0
      ? [{
          timestamp: Date.now(),
          label: formatPortfolioHistoryLabel(Date.now(), range),
          value: fallbackValue,
          cost: fallbackCost,
          gainLoss: fallbackValue - fallbackCost,
          gainLossPct: fallbackCost ? ((fallbackValue - fallbackCost) / fallbackCost) * 100 : 0,
        }]
      : [];
}

function trimPortfolioHistory(points: PortfolioHistoryPoint[], lookbackDays?: number): PortfolioHistoryPoint[] {
  if (!lookbackDays || points.length <= 1) return points;
  const latestTimestamp = points[points.length - 1]?.timestamp;
  if (!latestTimestamp) return points;
  const lookbackStart = latestTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
  const trimmed = points.filter((point) => point.timestamp >= lookbackStart);
  if (!trimmed.length) return points;
  if (trimmed.length === 1) {
    const previousPoint = [...points].reverse().find((point) => point.timestamp < lookbackStart);
    return previousPoint ? [previousPoint, trimmed[0]] : trimmed;
  }
  return trimmed;
}

type AxisScale = {
  domain: [number, number];
  ticks: number[];
  step: number;
};

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;

  let niceFraction: number;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * 10 ** exponent;
}

function buildAdaptiveAxisScale(
  values: number[],
  options?: { clampMinToZero?: boolean; tickCount?: number; paddingPct?: number; flatPaddingPct?: number }
): AxisScale {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const targetTickCount = options?.tickCount ?? 5;
  const paddingPct = options?.paddingPct ?? 0.08;
  const flatPaddingPct = options?.flatPaddingPct ?? 0.02;
  if (!finiteValues.length) {
    return {
      domain: [0, 1],
      ticks: [0, 0.25, 0.5, 0.75, 1],
      step: 0.25,
    };
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  let paddedMin = min;
  let paddedMax = max;

  if (min === max) {
    const padding = Math.max(Math.abs(min) * flatPaddingPct, 1);
    paddedMin = options?.clampMinToZero ? Math.max(0, min - padding) : min - padding;
    paddedMax = max + padding;
  } else {
    const spread = max - min;
    const padding = Math.max(spread * paddingPct, Math.max(Math.abs(max), Math.abs(min), 1) * (paddingPct * 0.2));
    paddedMin = options?.clampMinToZero ? Math.max(0, min - padding) : min - padding;
    paddedMax = max + padding;
  }

  const rawStep = (paddedMax - paddedMin) / Math.max(1, targetTickCount - 1);
  const step = niceStep(rawStep);
  let lower = Math.floor(paddedMin / step) * step;
  const upper = Math.ceil(paddedMax / step) * step;
  if (options?.clampMinToZero) lower = Math.max(0, lower);
  const safeUpper = lower === upper ? upper + step : upper;

  const ticks: number[] = [];
  for (let value = lower; value <= safeUpper + step * 0.25; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }

  return {
    domain: [lower, safeUpper],
    ticks,
    step,
  };
}

function formatRoundedCurrencyAxisTick(value: number, step: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
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

  return `${sign}$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(scaledValue)}${suffix}`;
}

function formatCurrencyAmount(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}$${fmt.price(absolute, decimals)}`;
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

export function PortfolioPanel() {
  useTheme();
  const themePalette = getThemePalette();
  const { portfolio, addPortfolioPositions, updatePortfolioPosition, removePortfolioPosition, clearPortfolio, setActivePanel } = useTerminalStore();
  const [showAdd, setShowAdd] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sharesInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editSharesInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const symbols = [...new Set(portfolio.map((position) => position.symbol))];

  const { data: quotes = [] } = useQuery({
    queryKey: ['portfolio-quotes', symbols],
    queryFn: () => fetchQuotes(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 30000,
    staleTime: 15000,
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

  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  const lots: PortfolioLot[] = portfolio.map((position) => {
    const purchaseDate = resolvePurchaseDate(position);
    const quote = quoteMap.get(position.symbol);
    const currentPrice = quote?.regularMarketPrice ?? position.avgCost;
    const currentValue = currentPrice * position.shares;
    const totalCost = position.avgCost * position.shares;
    const gainLoss = currentValue - totalCost;
    const gainLossPct = totalCost ? (gainLoss / totalCost) * 100 : 0;

    return {
      ...position,
      purchaseDate,
      currentPrice,
      currentValue,
      totalCost,
      gainLoss,
      gainLossPct,
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
      existing.lotCount += 1;
      existing.lots.push(lot);
      continue;
    }

    groupedMap.set(lot.symbol, {
      symbol: lot.symbol,
      shortName: lot.shortName,
      shares: lot.shares,
      avgCost: 0,
      currentPrice: lot.currentPrice,
      currentValue: lot.currentValue,
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
          const lotsByDate = [...position.lots].sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));

          return {
            ...position,
            avgCost,
            currentPrice,
            gainLossPct,
            lots: lotsByDate,
          };
        })
        .sort((left, right) => comparePortfolioRows(left, right, sortKey, sortDirection)),
    [groupedMap, sortDirection, sortKey]
  );

  const totalValue = positions.reduce((acc, position) => acc + position.currentValue, 0);
  const totalCost = positions.reduce((acc, position) => acc + position.totalCost, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPct = totalCost ? (totalGainLoss / totalCost) * 100 : 0;
  const totalLots = positions.reduce((acc, position) => acc + position.lotCount, 0);
  const currentFormSymbol = symbolInput.trim().toUpperCase();
  const isAddingToExistingPosition = currentFormSymbol.length > 0 && symbols.includes(currentFormSymbol);

  const parsedDrafts = lotDrafts.map(parseLotFields);
  const validDraftCount = parsedDrafts.filter((draft) => draft.isValid).length;
  const canSubmit = symbolInput.trim().length > 0 && validDraftCount > 0 && validDraftCount === lotDrafts.length;
  const parsedEditingLot = editingLot ? parseLotFields(editingLot) : null;
  const canSaveEdit = Boolean(editingLot && editingLot.symbol.trim().length > 0 && parsedEditingLot?.isValid);
  const activeHistoryTimeframe = PORTFOLIO_HISTORY_TIMEFRAMES.find(
    (option) => option.range === historyRange && option.lookbackDays === historyLookbackDays
  ) ?? PORTFOLIO_HISTORY_TIMEFRAMES[4];
  const effectiveHistorySymbols = useMemo(() => {
    const available = positions.map((position) => position.symbol);
    const filtered = selectedHistorySymbols.filter((symbol) => available.includes(symbol));
    if (historySelectionMode === 'all') return available;
    if (historySelectionMode === 'none') return [];
    return filtered;
  }, [historySelectionMode, positions, selectedHistorySymbols]);
  const historyLots = useMemo(
    () => lots.filter((lot) => effectiveHistorySymbols.includes(lot.symbol)),
    [effectiveHistorySymbols, lots]
  );
  const historyTotalValue = useMemo(
    () => positions
      .filter((position) => effectiveHistorySymbols.includes(position.symbol))
      .reduce((acc, position) => acc + position.currentValue, 0),
    [effectiveHistorySymbols, positions]
  );
  const historyTotalCost = useMemo(
    () => positions
      .filter((position) => effectiveHistorySymbols.includes(position.symbol))
      .reduce((acc, position) => acc + position.totalCost, 0),
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
  const historySeed = historyLots
    .map((lot) => `${lot.id}:${lot.symbol}:${lot.shares}:${lot.avgCost}:${lot.purchaseDate}`)
    .sort()
    .join('|');

  const { data: portfolioHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['portfolio-history', historySeed, activeHistoryTimeframe.range, activeHistoryTimeframe.interval, activeHistoryTimeframe.lookbackDays],
    enabled: historyLots.length > 0,
    staleTime: 60000,
    queryFn: async () => {
      const chartSeries = await Promise.all(
        Array.from(new Set(historyLots.map((lot) => lot.symbol))).map(async (symbol) => ({
          symbol,
          points: await fetchChart(symbol, activeHistoryTimeframe.range, activeHistoryTimeframe.interval).catch(() => []),
        }))
      );

      const history = buildPortfolioHistory(historyLots, chartSeries, activeHistoryTimeframe.range, historyTotalValue, historyTotalCost);
      return trimPortfolioHistory(history, activeHistoryTimeframe.lookbackDays);
    },
  });
  const isShortHistoryWindow = Boolean(activeHistoryTimeframe.lookbackDays && activeHistoryTimeframe.lookbackDays <= 30);
  const valueAxisScale = useMemo(
    () =>
      buildAdaptiveAxisScale(
        portfolioHistory.map((point) => point.value),
        {
          clampMinToZero: true,
          tickCount: 5,
          paddingPct: isShortHistoryWindow ? 0.05 : 0.08,
          flatPaddingPct: isShortHistoryWindow ? 0.015 : 0.02,
        }
      ),
    [isShortHistoryWindow, portfolioHistory]
  );
  const pnlAxisScale = useMemo(
    () => buildAdaptiveAxisScale(portfolioHistory.map((point) => point.gainLoss), { tickCount: 5 }),
    [portfolioHistory]
  );

  const pieData = positions.map((position) => ({
    name: position.symbol,
    value: position.currentValue,
    pct: totalValue ? (position.currentValue / totalValue) * 100 : 0,
  }));
  const assetClassData = Array.from(
    positions.reduce((groups, position) => {
      const quote = quoteMap.get(position.symbol);
      const assetClass = inferPortfolioAssetClass(position.symbol, quote);
      const existing = groups.get(assetClass) ?? { name: assetClass, value: 0, pct: 0 };
      existing.value += position.currentValue;
      groups.set(assetClass, existing);
      return groups;
    }, new Map<string, { name: string; value: number; pct: number }>())
  )
    .map(([, value]) => ({
      ...value,
      pct: totalValue ? (value.value / totalValue) * 100 : 0,
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
    setSymbolInput(nextSymbol);
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

  const openAddForm = (nextSymbol = '') => {
    const normalizedSymbol = nextSymbol.trim().toUpperCase();
    closeEditForm();
    resetAddForm(normalizedSymbol);
    setShowAdd(true);
    setTimeout(() => {
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      editSharesInputRef.current?.focus();
    }, 0);
  };

  const handleSelectSymbol = (symbol?: string) => {
    if (!symbol) return;
    setSymbolInput(symbol.toUpperCase());
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

    const addedAt = new Date().toISOString();
    addPortfolioPositions(
      nextLots.map((lot) => ({
        symbol,
        shares: lot.shares,
        avgCost: lot.avgCost,
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
        message: `Imported ${result.lots.length} lot${result.lots.length === 1 ? '' : 's'} across ${importedAssetCount} symbol${importedAssetCount === 1 ? '' : 's'} from ${result.sourceLabel}.${skippedSuffix}`,
      });
    } catch (error) {
      setImportFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to import the selected CSV file.',
      });
    } finally {
      event.target.value = '';
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

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="text-terminal-accent font-bold text-sm tracking-wider">PORTFOLIO TRACKER</h1>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
            onClick={allLotsExpanded ? handleCollapseAllLots : handleExpandAllLots}
            disabled={positions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-panel border border-terminal-border text-terminal-muted rounded text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allLotsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {allLotsExpanded ? 'COLLAPSE ALL' : 'EXPAND ALL'}
          </button>
          <button
            onClick={() => setShowClearPortfolioConfirm(true)}
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
        </div>
      </div>

      <div className="text-terminal-faint text-xs">
        Import appends new lots from Yahoo Finance or compatible CSV exports with symbol, quantity, purchase price, and trade date columns. Export downloads the current lot-level portfolio snapshot as a CSV file.
      </div>

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
        <div className="bg-terminal-panel border border-terminal-border rounded p-3 animate-fade-in">
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
              <label className="text-terminal-faint text-xs block mb-1">PURCHASE PRICE</label>
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
        <div className="bg-terminal-panel border border-terminal-border rounded p-3 animate-fade-in">
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

          <div className="mt-3 space-y-2">
            <div className="hidden md:grid md:grid-cols-[1.1fr_1.1fr_1.1fr_auto] gap-2 px-1">
              <span className="text-terminal-faint text-[11px] tracking-wide">SHARES</span>
              <span className="text-terminal-faint text-[11px] tracking-wide">PURCHASE PRICE</span>
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
                  <label className="text-terminal-faint text-xs block mb-1 md:hidden">PURCHASE PRICE</label>
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
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">TOTAL VALUE</div>
                <div className="text-terminal-text font-bold text-lg tabular-nums">{fmt.marketCap(selectedTotalValue)}</div>
                <div className="text-terminal-faint text-[10px] mt-1">{selectionScopeLabel}</div>
              </div>
              <div className="bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">TOTAL COST</div>
                <div className="text-terminal-text font-bold text-lg tabular-nums">{fmt.marketCap(selectedTotalCost)}</div>
                <div className="text-terminal-faint text-[10px] mt-1">{selectionScopeLabel}</div>
              </div>
              <div className={`bg-terminal-panel border rounded p-3 ${selectedTotalGainLoss >= 0 ? 'border-terminal-positive/30' : 'border-terminal-negative/30'}`}>
                <div className="text-terminal-faint text-xs mb-1">TOTAL P&amp;L</div>
                <div className={`font-bold text-lg tabular-nums ${selectedTotalGainLoss >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
                  {fmt.change(selectedTotalGainLoss)} <span className="text-sm">({fmt.pct(selectedTotalGainLossPct)})</span>
                </div>
                <div className="text-terminal-faint text-[10px] mt-1">{selectionScopeLabel}</div>
              </div>
              <div className="bg-terminal-panel border border-terminal-border rounded p-3">
                <div className="text-terminal-faint text-xs mb-1">ASSETS / LOTS</div>
                <div className="text-terminal-text font-bold text-lg tabular-nums">
                  {positions.length} / {totalLots}
                </div>
              </div>
            </div>

            <div className="bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-terminal-muted text-xs font-bold tracking-wider">PORTFOLIO VALUE &amp; GROWTH</div>
                  <div className="text-terminal-faint text-xs mt-1">
                    Historical portfolio value, cumulative cost basis, and net P&amp;L derived from your dated lots for the selected assets.
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
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
                        ? 'border-terminal-negative/40 bg-terminal-negative/10 text-terminal-negative'
                        : 'border-terminal-border text-terminal-faint hover:text-terminal-negative hover:border-terminal-negative/30 hover:bg-terminal-hover'
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
                            ? 'border-terminal-positive/40 bg-terminal-positive/10 text-terminal-positive'
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
                {loadingHistory ? (
                  <div className="shimmer h-[280px] rounded" />
                ) : portfolioHistory.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center rounded border border-terminal-border/70 bg-terminal-elevated/30 text-terminal-faint text-xs">
                    Historical portfolio value is unavailable until at least one selected asset has usable price history.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={portfolioHistory} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="portfolio-value-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={themePalette.accent} stopOpacity={0.32} />
                          <stop offset="100%" stopColor={themePalette.accent} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={themePalette.chartGrid} strokeOpacity={0.7} vertical={false} />
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
                        ticks={valueAxisScale.ticks}
                        label={{ value: 'VALUE ($)', angle: -90, position: 'insideLeft', fill: themePalette.muted, fontSize: 10, dx: -4 }}
                        tick={{ fill: themePalette.muted, fontSize: 11 }}
                        tickFormatter={(value: number) => formatRoundedCurrencyAxisTick(value, valueAxisScale.step)}
                        tickLine={false}
                        axisLine={false}
                        width={78}
                      />
                      <YAxis
                        yAxisId="pnl"
                        orientation="right"
                        domain={pnlAxisScale.domain}
                        hide
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'Net P&L') return [formatCurrencyAmount(value, 2), name];
                          return [fmt.marketCap(value), name];
                        }}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as PortfolioHistoryPoint | undefined;
                          return point
                            ? new Date(point.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                            : '';
                        }}
                        contentStyle={{ background: themePalette.elevated, border: `1px solid ${themePalette.border}`, borderRadius: '4px', fontSize: '11px' }}
                        labelStyle={{ color: themePalette.text }}
                        itemStyle={{ color: themePalette.muted }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', color: themePalette.muted }} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Portfolio Value"
                        stroke={themePalette.accent}
                        strokeWidth={2}
                        fill="url(#portfolio-value-fill)"
                        yAxisId="value"
                      />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        name="Cost Basis"
                        stroke={themePalette.blue}
                        strokeWidth={1.6}
                        strokeDasharray="5 4"
                        dot={false}
                        yAxisId="value"
                      />
                      <Line
                        type="monotone"
                        dataKey="gainLoss"
                        name="Net P&L"
                        stroke={themePalette.positive}
                        strokeWidth={1.8}
                        dot={false}
                        yAxisId="pnl"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-terminal-border/60 bg-terminal-elevated/40">
                <div>
                  <div className="text-terminal-muted text-xs font-bold tracking-wider">POSITIONS & LOTS</div>
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
                            <td className="tabular-nums">${fmt.price(position.avgCost)}</td>
                            <td className="tabular-nums">${fmt.price(position.currentPrice)}</td>
                            <td className="tabular-nums font-bold">{fmt.marketCap(position.currentValue)}</td>
                            <td className={`tabular-nums ${changeColor(position.gainLoss)}`}>{fmt.change(position.gainLoss, 2)}</td>
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
                              <td colSpan={9} className="bg-terminal-elevated/50 px-3 py-3">
                                <div className="rounded border border-terminal-border overflow-hidden">
                                  <div className="px-3 py-2 panel-border-b bg-terminal-panel/80 flex items-center justify-between gap-3">
                                    <span className="text-terminal-muted text-xs font-bold tracking-wider">
                                      {position.symbol} LOTS
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
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">${fmt.price(lot.avgCost)}</td>
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">{fmt.marketCap(lot.totalCost)}</td>
                                            <td className="px-3 py-2 text-terminal-text text-right tabular-nums">{fmt.marketCap(lot.currentValue)}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${changeColor(lot.gainLoss)}`}>
                                              {fmt.change(lot.gainLoss, 2)} ({fmt.pct(lot.gainLossPct)})
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

          <div className="space-y-3">
            <div className="bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">ALLOCATION BY SYMBOL</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${fmt.marketCap(value)}`, 'Value']}
                    contentStyle={{ background: themePalette.elevated, border: `1px solid ${themePalette.border}`, borderRadius: '4px', fontSize: '11px' }}
                    labelStyle={{ color: themePalette.text }}
                    itemStyle={{ color: themePalette.muted }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {pieData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-terminal-text truncate">{item.name}</span>
                    </div>
                    <span className="text-terminal-muted tabular-nums">{item.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-terminal-panel border border-terminal-border rounded p-3">
              <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">ALLOCATION BY ASSET CLASS</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={assetClassData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                    {assetClassData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${fmt.marketCap(value)}`, 'Value']}
                    contentStyle={{ background: themePalette.elevated, border: `1px solid ${themePalette.border}`, borderRadius: '4px', fontSize: '11px' }}
                    labelStyle={{ color: themePalette.text }}
                    itemStyle={{ color: themePalette.muted }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {assetClassData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-terminal-text truncate">{item.name}</span>
                    </div>
                    <span className="text-terminal-muted tabular-nums">{item.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

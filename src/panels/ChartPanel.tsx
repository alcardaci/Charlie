import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  isBusinessDay,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type TickMarkType,
} from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, FileText, Plus, Star, StarOff } from 'lucide-react';
import { fetchChartWindow, fetchQuotes } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { changeColor, fmt } from '../utils/formatters';
import { getThemePalette, useTheme } from '../utils/theme';
import type { ChartInterval, ChartPoint, ChartRange, ChartStyle } from '../types';
import type { MultiAssetView } from '../store/useTerminalStore';
import { prepareChartPoints } from '../utils/chartData';

const TIMEFRAMES: { label: string; range: ChartRange; interval: ChartInterval }[] = [
  { label: '1D', range: '1d', interval: '5m' },
  { label: '5D', range: '5d', interval: '15m' },
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '3M', range: '3mo', interval: '1d' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1d' },
  { label: '5Y', range: '5y', interval: '1wk' },
  { label: 'MAX', range: 'max', interval: '1mo' },
];
const CUSTOM_TIMEFRAME_INDEX = -1;

const CHART_STYLES: Array<{ key: ChartStyle; label: string }> = [
  { key: 'candlestick', label: 'CANDLE' },
  { key: 'ohlc', label: 'OHLC' },
  { key: 'area', label: 'AREA' },
];

const INDICATORS = ['MA20', 'MA50', 'MA200'] as const;
const MA_KEYS: Record<string, 'sma20' | 'sma50' | 'sma200'> = { MA20: 'sma20', MA50: 'sma50', MA200: 'sma200' };

type PriceSeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Bar'> | ISeriesApi<'Area'>;
type ChartPalette = ReturnType<typeof getThemePalette>;

const movingAverageStyles = {
  MA20: { ink: 'text', lineStyle: LineStyle.Dashed, legendStyle: 'dashed' },
  MA50: { ink: 'accent', lineStyle: LineStyle.Solid, legendStyle: 'solid' },
  MA200: { ink: 'purple', lineStyle: LineStyle.SparseDotted, legendStyle: 'dotted' },
} as const;

function chartTime(point: ChartPoint): Time {
  return Math.floor(point.timestamp / 1000) as Time;
}

function chartTimeToDate(time: Time): Date | null {
  if (typeof time === 'number') return new Date(time * 1000);
  if (typeof time === 'string') {
    const parsed = new Date(time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (isBusinessDay(time)) return new Date(Date.UTC(time.year, time.month - 1, time.day));
  return null;
}

function formatChartLocalTime(time: Time, intraday: boolean, showYear: boolean): string {
  const date = chartTimeToDate(time);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    ...(!intraday ? { timeZone: 'UTC' } : {}),
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
    ...(intraday ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function chooseCustomInterval(start: string, end: string): ChartInterval {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));

  if (days > 365 * 5) return '1mo';
  if (days > 365) return '1wk';
  return '1d';
}

function shouldShowYearInAxis(range: ChartRange | null, customStart?: string | null, customEnd?: string | null): boolean {
  if (range && ['2y', '5y', '10y', 'max'].includes(range)) return true;
  if (!customStart || !customEnd) return false;

  const startMs = Date.parse(customStart);
  const endMs = Date.parse(customEnd);
  const days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));
  return days > 366;
}

function createPriceSeries(chart: IChartApi, chartStyle: ChartStyle): PriceSeries {
  switch (chartStyle) {
    case 'ohlc':
      return chart.addBarSeries({
        openVisible: true,
        thinBars: false,
      });
    case 'area':
      return chart.addAreaSeries({
        lineStyle: LineStyle.Dotted,
        bottomColor: 'transparent',
        lineWidth: 2,
        priceLineVisible: true,
        crosshairMarkerVisible: false,
      });
    case 'candlestick':
    default:
      return chart.addCandlestickSeries();
  }
}

function priceColors(chartStyle: ChartStyle, palette: ChartPalette) {
  switch (chartStyle) {
    case 'area': return { lineColor: palette.text, topColor: palette.chartGrid };
    case 'ohlc': return { upColor: palette.positive, downColor: palette.negative };
    case 'candlestick': return {
      upColor: palette.positive, downColor: palette.negative,
      borderUpColor: palette.positive, borderDownColor: palette.negative,
      wickUpColor: palette.positive, wickDownColor: palette.negative,
    };
  }
}

function setPriceSeriesData(data: ChartPoint[], chartStyle: ChartStyle, series: PriceSeries | null, flatColor: string) {
  if (!series) return;

  if (chartStyle === 'candlestick') {
    (series as ISeriesApi<'Candlestick'>).setData(
      data.map((point) => ({
        time: chartTime(point),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        ...(point.close === point.open && { color: flatColor, borderColor: flatColor, wickColor: flatColor }),
      }))
    );
    return;
  }

  if (chartStyle === 'ohlc') {
    (series as ISeriesApi<'Bar'>).setData(
      data.map((point) => ({
        time: chartTime(point),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        ...(point.close === point.open && { color: flatColor }),
      }))
    );
    return;
  }

  (series as ISeriesApi<'Area'>).setData(
    data.map((point) => ({
      time: chartTime(point),
      value: point.close,
    }))
  );
}

function applyData(
  data: ChartPoint[],
  chartStyle: ChartStyle,
  priceSeries: PriceSeries | null,
  volumeSeries: ISeriesApi<'Histogram'> | null,
  maMap: Map<string, ISeriesApi<'Line'>>,
  palette: ChartPalette
) {
  if (!priceSeries || !volumeSeries) return;
  if (!data.length) {
    priceSeries.setData([]);
    volumeSeries.setData([]);
    maMap.forEach((series) => series.setData([]));
    return;
  }

  setPriceSeriesData(data, chartStyle, priceSeries, palette.faint);

  volumeSeries.setData(
    data.map((point) => ({
      time: chartTime(point),
      value: point.volume,
      color: point.close > point.open ? palette.positiveDim : point.close < point.open ? palette.negativeDim : palette.faint,
    }))
  );

  maMap.forEach((series, indicator) => {
    const key = MA_KEYS[indicator];
    series.setData(
      data
        .filter((point) => point[key] !== undefined)
        .map((point) => ({
          time: chartTime(point),
          value: point[key] as number,
        }))
    );
  });
}

type ChartPanelProps = {
  symbol?: string;
  embedded?: boolean;
  onOpenParallel?: (symbol: string, view: MultiAssetView) => void;
  onSwitchView?: (view: MultiAssetView) => void;
};

export function ChartPanel({ symbol, embedded = false, onOpenParallel, onSwitchView }: ChartPanelProps = {}) {
  const {
    activeSymbol,
    addToWatchlist,
    removeFromWatchlist,
    watchlist,
    setActivePanel,
    openMultiAssetView,
    chartStyle,
    setChartStyle,
  } = useTerminalStore();
  const selectedSymbol = (symbol ?? activeSymbol).toUpperCase();
  const { mode } = useTheme();
  const inWatchlist = watchlist.includes(selectedSymbol);
  const themePalette = useMemo(() => getThemePalette(), [mode]);

  const [tfIdx, setTfIdx] = useState(5);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['MA20', 'MA50']));
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [customAppliedRange, setCustomAppliedRange] = useState<{ start: string; end: string } | null>(null);
  const [customDraftStart, setCustomDraftStart] = useState(() => {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 2);
    return toInputDate(start);
  });
  const [customDraftEnd, setCustomDraftEnd] = useState(() => toInputDate(new Date()));

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<PriceSeries | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  const tf = tfIdx >= 0 ? TIMEFRAMES[tfIdx] : null;
  const chartInterval = customAppliedRange
    ? chooseCustomInterval(customAppliedRange.start, customAppliedRange.end)
    : (tf?.interval ?? '1d');
  const showYearInAxis = shouldShowYearInAxis(tf?.range ?? null, customAppliedRange?.start, customAppliedRange?.end);
  const chartConfig = useMemo(() => ({
    symbol: selectedSymbol, tf, activeIndicators, chartStyle, showYearInAxis,
  }), [selectedSymbol, tf, activeIndicators, chartStyle, showYearInAxis]);

  const { data: quote } = useQuery({
    queryKey: ['quote-chart', selectedSymbol],
    queryFn: () => fetchQuotes([selectedSymbol]).then((results) => results[0]),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: chartResult, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['chart', selectedSymbol, tf?.range ?? 'custom', chartInterval, customAppliedRange?.start ?? null, customAppliedRange?.end ?? null],
    queryFn: () => fetchChartWindow(
      selectedSymbol,
      customAppliedRange
        ? {
            interval: chartInterval,
            period1: customAppliedRange.start,
            period2: customAppliedRange.end,
          }
        : {
            range: tf?.range ?? '1y',
            interval: chartInterval,
          }
    ),
    refetchInterval: tf?.range === '1d' ? 30000 : tf?.range === '5d' ? 60000 : 300000,
    staleTime: tf?.range === '1d' ? 15000 : 60000,
    gcTime: 1800000,
    retry: 1,
  });
  const chartData = useMemo(() => prepareChartPoints(chartResult?.points ?? []), [chartResult?.points]);

  const customAdjustmentNotice = useMemo(() => {
    if (!customAppliedRange || !chartResult?.adjusted || !chartResult.actualStart || !chartResult.actualEnd) return null;
    return `Custom range adjusted to available data: ${chartResult.actualStart} to ${chartResult.actualEnd}.`;
  }, [chartResult?.actualEnd, chartResult?.actualStart, chartResult?.adjusted, customAppliedRange]);

  const toggleIndicator = (indicator: string) => {
    setActiveIndicators((previous) => {
      const next = new Set(previous);
      if (next.has(indicator)) next.delete(indicator);
      else next.add(indicator);
      return next;
    });
  };

  const applyCustomRange = () => {
    const today = toInputDate(new Date());
    const start = customDraftStart.trim();
    const endInput = customDraftEnd.trim() || today;
    const end = endInput > today ? today : endInput;

    if (!start || !end) {
      setCustomRangeError('Choose both a start and end date.');
      return;
    }

    if (start > end) {
      setCustomRangeError('The custom start date must be on or before the end date.');
      return;
    }

    setCustomDraftEnd(end);
    setCustomRangeError(null);
    setCustomAppliedRange({ start, end });
    setTfIdx(CUSTOM_TIMEFRAME_INDEX);
    setCustomPickerOpen(false);
  };

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstanceRef.current?.remove();
    chartInstanceRef.current = null;

    const { tf, activeIndicators, chartStyle, showYearInAxis } = chartConfig;
    const intradayTimeScale = Boolean(tf && (tf.range === '1d' || tf.range === '5d'));
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      layout: {
        fontSize: 11,
        fontFamily: getComputedStyle(chartRef.current).fontFamily,
      },
      localization: {
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        timeFormatter: (time: Time) => formatChartLocalTime(time, intradayTimeScale, showYearInAxis),
      },
      grid: {
        vertLines: { style: LineStyle.Dotted },
        horzLines: { style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { width: 1, style: LineStyle.Dashed },
        horzLine: { width: 1, style: LineStyle.Dashed },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time, _type: TickMarkType, _locale: string) => formatChartLocalTime(time, intradayTimeScale, showYearInAxis),
      },
      rightPriceScale: { autoScale: true, scaleMargins: { top: 0.1, bottom: 0.25 } },
      handleScroll: true,
      handleScale: true,
    });

    chartInstanceRef.current = chart;
    priceSeriesRef.current = createPriceSeries(chart, chartStyle);

    volumeSeriesRef.current = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const maMap = new Map<string, ISeriesApi<'Line'>>();
    INDICATORS.forEach((indicator) => {
      if (!activeIndicators.has(indicator)) return;
      maMap.set(
        indicator,
        chart.addLineSeries({
          lineStyle: movingAverageStyles[indicator].lineStyle,
          lineWidth: 1,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          lastValueVisible: true,
        })
      );
    });
    maSeriesRef.current = maMap;

    const observer = new ResizeObserver(() => {
      if (!chartRef.current) return;
      chart.applyOptions({ width: chartRef.current.clientWidth, height: chartRef.current.clientHeight });
    });
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRef.current = new Map();
      chartInstanceRef.current = null;
    };
  }, [chartConfig]);

  useEffect(() => {
    const crosshairColors = { color: themePalette.accent, labelBackgroundColor: themePalette.accent };
    chartInstanceRef.current?.applyOptions({
      layout: { background: { type: ColorType.Solid, color: themePalette.panel }, textColor: themePalette.muted },
      grid: { vertLines: { color: themePalette.chartGrid }, horzLines: { color: themePalette.chartGrid } },
      crosshair: { vertLine: crosshairColors, horzLine: crosshairColors },
      timeScale: { borderColor: themePalette.border },
      rightPriceScale: { borderColor: themePalette.border },
    });
    priceSeriesRef.current?.applyOptions(priceColors(chartConfig.chartStyle, themePalette));
    volumeSeriesRef.current?.applyOptions({ color: themePalette.positiveDim });
    for (const indicator of INDICATORS) {
      maSeriesRef.current.get(indicator)?.applyOptions({ color: themePalette[movingAverageStyles[indicator].ink] });
    }
  }, [chartConfig, themePalette]);

  useEffect(() => {
    applyData(chartData, chartConfig.chartStyle, priceSeriesRef.current, volumeSeriesRef.current, maSeriesRef.current, themePalette);
  }, [chartData, chartConfig, themePalette]);

  useEffect(() => {
    if (chartData.length) chartInstanceRef.current?.timeScale().fitContent();
  }, [chartData, chartConfig]);

  const timeframePriceMove = useMemo(() => {
    if (!chartData.length) return null;
    const firstPoint = chartData[0];
    const lastPoint = chartData[chartData.length - 1];
    // A separately fetched current quote must never rewrite a past candle or
    // change the return of a custom historical window.
    const change = chartData.length > 1 ? lastPoint.close - firstPoint.close : null;
    return {
      currentPrice: lastPoint.close,
      change,
      changePct: change != null && firstPoint.close !== 0 ? change / firstPoint.close * 100 : null,
    };
  }, [chartData]);

  const displayedPrice = timeframePriceMove?.currentPrice ?? quote?.regularMarketPrice ?? null;
  const displayedChange = timeframePriceMove ? timeframePriceMove.change : quote?.regularMarketChange ?? null;
  const displayedChangePct = timeframePriceMove ? timeframePriceMove.changePct : quote?.regularMarketChangePercent ?? null;
  const chgColor = changeColor(displayedChangePct);
  const SymbolHeading = embedded ? 'div' : 'h1';

  return (
    <div className="h-full flex flex-col">
      <div className="instrument-section flex items-center justify-between gap-3 px-3 py-2 panel-border-b bg-terminal-panel flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <SymbolHeading className="workspace-title">
            <button
              onClick={() => {
                if (onSwitchView) {
                  onSwitchView('research');
                  return;
                }
                setActivePanel('equity', selectedSymbol);
              }}
              className="hover:text-terminal-accent hover:underline"
            >
              {selectedSymbol}
            </button>
          </SymbolHeading>
          {displayedPrice !== null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-terminal-text tabular-nums font-bold">
                {fmt.price(displayedPrice)}
              </span>
              <span className={`tabular-nums ${chgColor}`}>
                {fmt.change(displayedChange)} ({fmt.pct(displayedChangePct)})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1 mr-2 flex-wrap">
            <span className="text-terminal-faint text-[10px] tracking-wider">STYLE</span>
            {CHART_STYLES.map((style) => (
              <button
                key={style.key}
                onClick={() => setChartStyle(style.key)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  chartStyle === style.key
                    ? 'border-terminal-accent/60 text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 mr-2 flex-wrap">
            {INDICATORS.map((indicator) => (
              <button
                key={indicator}
                onClick={() => toggleIndicator(indicator)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  activeIndicators.has(indicator)
                    ? 'border-terminal-accent/60 text-terminal-accent bg-terminal-accent/10'
                    : 'border-terminal-border text-terminal-faint hover:text-terminal-muted'
                }`}
              >
                {indicator}
              </button>
            ))}
          </div>

          <div className="flex gap-0.5 flex-wrap">
            {TIMEFRAMES.map((timeframe, index) => (
              <button
                key={timeframe.label}
                onClick={() => {
                  setTfIdx(index);
                  setCustomAppliedRange(null);
                  setCustomRangeError(null);
                  setCustomPickerOpen(false);
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  tfIdx === index
                    ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                    : 'text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
                }`}
              >
                {timeframe.label}
              </button>
            ))}
            <button
              onClick={() => setCustomPickerOpen((current) => !current)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                tfIdx === CUSTOM_TIMEFRAME_INDEX || customPickerOpen
                  ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                  : 'text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
              }`}
            >
              <CalendarRange size={11} />
              CUSTOM
            </button>
          </div>

          <button
            onClick={() => (inWatchlist ? removeFromWatchlist(selectedSymbol) : addToWatchlist(selectedSymbol))}
            className={`ml-1 p-1 rounded hover:bg-terminal-hover ${inWatchlist ? 'text-terminal-accent' : 'text-terminal-faint'}`}
            aria-label={`${inWatchlist ? 'Remove from' : 'Add to'} watchlist`}
          >
            {inWatchlist ? <Star size={13} fill="currentColor" /> : <StarOff size={13} />}
          </button>
          {embedded && (
            <button
              onClick={() => onSwitchView?.('research')}
              className="flex items-center gap-1.5 rounded border border-terminal-border px-2 py-1 text-xs text-terminal-muted transition-colors hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent"
            >
              <FileText size={12} />
              RESEARCH
            </button>
          )}
          {!embedded && (
            <button
              onClick={() => (onOpenParallel ?? openMultiAssetView)(selectedSymbol, 'chart')}
              className="flex items-center gap-1.5 rounded border border-terminal-border px-2 py-1 text-xs text-terminal-muted transition-colors hover:border-terminal-accent/40 hover:bg-terminal-hover hover:text-terminal-accent"
            >
              <Plus size={12} />
              PARALLEL
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 px-3 py-1 bg-terminal-bg flex-shrink-0">
        <span className="text-terminal-faint text-xs">
          STYLE: {CHART_STYLES.find((style) => style.key === chartStyle)?.label ?? 'CANDLE'}
        </span>
        {customAppliedRange && (
          <span className="text-terminal-faint text-xs">
            RANGE: {customAppliedRange.start} to {customAppliedRange.end}
          </span>
        )}
        {INDICATORS.filter((indicator) => activeIndicators.has(indicator)).map((indicator) => (
          <div key={indicator} className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="w-4 border-t-2" style={{ borderColor: themePalette[movingAverageStyles[indicator].ink], borderTopStyle: movingAverageStyles[indicator].legendStyle }} />
            <span className="text-terminal-faint">{indicator}</span>
          </div>
        ))}
        {isFetching && (
          <span className="text-terminal-faint text-xs animate-pulse ml-auto" role="status">{chartData.length ? 'Refreshing…' : 'Loading…'}</span>
        )}
      </div>

      {customPickerOpen && (
        <div className="instrument-section panel-border-b bg-terminal-panel px-3 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-terminal-faint">
                <span className="mb-1 block tracking-wider">START DATE</span>
                <input
                  type="date"
                  value={customDraftStart}
                  onChange={(event) => setCustomDraftStart(event.target.value)}
                  className="w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1.5 text-terminal-text focus:border-terminal-accent/60 focus:outline-none"
                />
              </label>
              <label className="text-xs text-terminal-faint">
                <span className="mb-1 block tracking-wider">END DATE</span>
                <input
                  type="date"
                  value={customDraftEnd}
                  max={toInputDate(new Date())}
                  onChange={(event) => setCustomDraftEnd(event.target.value)}
                  className="w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1.5 text-terminal-text focus:border-terminal-accent/60 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setCustomPickerOpen(false);
                  setCustomRangeError(null);
                }}
                className="rounded border border-terminal-border px-3 py-1.5 text-xs text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover"
              >
                CANCEL
              </button>
              <button
                onClick={applyCustomRange}
                className="rounded border border-terminal-accent/40 bg-terminal-accent/10 px-3 py-1.5 text-xs text-terminal-accent hover:bg-terminal-accent/20"
              >
                APPLY CUSTOM RANGE
              </button>
            </div>
          </div>

          {customRangeError && (
            <div className="mt-2 text-xs text-terminal-negative">{customRangeError}</div>
          )}
          <div className="mt-2 text-[11px] leading-relaxed text-terminal-faint">
            If the selected dates extend beyond the available chart history, the chart will automatically clamp to the closest available window.
          </div>
        </div>
      )}

      {customAdjustmentNotice && (
        <div className="panel-border-b bg-terminal-accent/5 px-3 py-2 text-xs text-terminal-muted">
          {customAdjustmentNotice}
        </div>
      )}

      {isError && chartData.length > 0 && <div className="panel-border-b px-3 py-2 text-xs text-terminal-muted" role="status">Refresh failed. Showing the last available observations.</div>}
      {chartData.length > 0 && <div className="panel-border-b px-3 py-1 text-[11px] text-terminal-faint">Price change for the selected window; excludes dividends. Last observation: {formatChartLocalTime(chartTime(chartData[chartData.length - 1]), chartInterval === '5m' || chartInterval === '15m', true)}.</div>}
      <div className="flex-1 min-h-0 relative">
        <div ref={chartRef} className="w-full h-full chart-container" />
        {isLoading && !chartData.length && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" role="status">
            <div className="text-terminal-accent text-sm animate-pulse">LOADING CHART DATA...</div>
          </div>
        )}
        {!isLoading && !chartData.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ backgroundColor: themePalette.panel }}>
            <div className="text-terminal-muted text-sm" role="status">{isError ? 'Price history could not be loaded.' : 'No price history is available for this symbol and date range.'}</div>
            <button onClick={() => void refetch()} disabled={isFetching} className="rounded border border-terminal-border px-3 py-1.5 text-xs text-terminal-accent hover:bg-terminal-hover disabled:opacity-50">RETRY</button>
          </div>
        )}
      </div>
    </div>
  );
}

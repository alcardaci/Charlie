import { quoteCurrencyUnit } from '../utils/portfolioValuation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2,
  FileText,
  Globe,
  Landmark,
  Plus,
  RefreshCw,
  Star,
  StarOff,
  TrendingUp,
  Users,
} from 'lucide-react';
import { fetchCompanyFinancials, fetchCompanyWorkbench, fetchQuotes, fetchSecCompanyData } from '../api/finance';
import { IndexOverview } from '../components/IndexOverview';
import { EarningsCalls } from '../components/EarningsCalls';
import { mergeCompanyFilings } from '../data/sec';
import { resolveEquityProfile } from '../utils/equityProfile';
import { CompanyFinancials, CompanyWorkbench, FinancialPeriodType, SecCompanyData, SecFiling, SecMetricKey, SecMetricObservation } from '../types';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';
import type { MultiAssetView } from '../store/useTerminalStore';

type WorkspaceTab = 'overview' | 'financials' | 'analysis' | 'ownership' | 'performance' | 'holdings' | 'details' | 'calls';

const EQUITY_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: 'overview', label: 'OVERVIEW' },
  { key: 'financials', label: 'FINANCIALS' },
  { key: 'analysis', label: 'ANALYSIS' },
  { key: 'ownership', label: 'OWNERSHIP / FILINGS' },
];

const COMPANY_TABS: typeof EQUITY_TABS = [...EQUITY_TABS, { key: 'calls', label: 'EARNINGS CALLS' }];

const FUND_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: 'overview', label: 'OVERVIEW' },
  { key: 'performance', label: 'PERFORMANCE' },
  { key: 'holdings', label: 'HOLDINGS' },
  { key: 'details', label: 'DETAILS' },
];

type EquityPanelProps = {
  symbol?: string;
  embedded?: boolean;
  onOpenParallel?: (symbol: string, view: MultiAssetView) => void;
  onSwitchView?: (view: MultiAssetView) => void;
};

export function EquityPanel({ symbol, embedded = false, onOpenParallel, onSwitchView }: EquityPanelProps = {}) {
  const { activeSymbol, setActivePanel, openMultiAssetView, addToWatchlist, removeFromWatchlist, watchlist } = useTerminalStore();
  const selectedSymbol = (symbol ?? activeSymbol).toUpperCase();
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [periodType, setPeriodType] = useState<FinancialPeriodType>('annual');
  const manualRefresh = useRef<string | null>(null);

  const inWatchlist = watchlist.includes(selectedSymbol);

  useEffect(() => {
    setTab('overview');
    setPeriodType('annual');
  }, [selectedSymbol]);

  const { data: workbench, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['equity-workbench', selectedSymbol],
    queryFn: ({ signal }) => fetchCompanyWorkbench(selectedSymbol, { signal, refresh: manualRefresh.current === selectedSymbol }),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const isIndex = workbench?.instrumentKind === 'index';
  const company = isIndex ? undefined : workbench;
  // ETFs share the equity workbench but do not hold company earnings calls.
  const hasCompanyCalls = company?.instrumentKind === 'equity' && company.instrumentLabel !== 'ETF'
    && (company.quote.quoteType || company.instrumentLabel).trim().toUpperCase() === 'EQUITY';
  const tabs = company?.instrumentKind === 'fund' ? FUND_TABS : hasCompanyCalls ? COMPANY_TABS : EQUITY_TABS;

  const { data: financials, isLoading: loadingFinancials, isFetching: fetchingFinancials, error: financialsError, refetch: refetchFinancials } = useQuery({
    queryKey: ['equity-financials', selectedSymbol, periodType],
    queryFn: ({ signal }) => fetchCompanyFinancials(selectedSymbol, periodType, { signal, refresh: manualRefresh.current === selectedSymbol }),
    enabled: Boolean(company) && company?.instrumentKind !== 'fund' && tab === 'financials',
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: secData, isLoading: loadingSec, isFetching: fetchingSec, error: secError, refetch: refetchSec } = useQuery({
    queryKey: ['equity-sec', selectedSymbol],
    queryFn: ({ signal }) => fetchSecCompanyData(selectedSymbol, signal, { refresh: manualRefresh.current === selectedSymbol }),
    enabled: workbench?.instrumentKind === 'equity',
    staleTime: 10 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const sectorEtf = company?.sectorContext.sectorEtf;
  const { data: sectorQuote } = useQuery({
    queryKey: ['sector-etf', sectorEtf],
    queryFn: () => fetchQuotes(sectorEtf ? [sectorEtf] : []).then((quotes) => quotes[0] ?? null),
    enabled: Boolean(sectorEtf),
    staleTime: 60000,
    refetchInterval: 120000,
  });

  useEffect(() => {
    if (!workbench || workbench.instrumentKind === 'index') return;
    if (!tabs.some((item) => item.key === tab)) {
      setTab('overview');
    }
  }, [tab, workbench, tabs]);

  async function refreshResearch() {
    if (manualRefresh.current === selectedSymbol) return;
    manualRefresh.current = selectedSymbol;
    try {
      const requests: Promise<unknown>[] = [refetch()];
      if (workbench?.instrumentKind === 'equity') requests.push(refetchSec());
      if (company && company.instrumentKind !== 'fund' && tab === 'financials') requests.push(refetchFinancials());
      await Promise.all(requests);
    } finally {
      if (manualRefresh.current === selectedSymbol) manualRefresh.current = null;
    }
  }

  if (isLoading) return <LoadingState symbol={selectedSymbol} />;
  if (!workbench) return <ErrorState symbol={selectedSymbol} onRetry={refreshResearch} />;

  const SymbolHeading = embedded ? 'span' : 'h1';
  const isFund = workbench.instrumentKind === 'fund';
  const { quote } = workbench;
  const resolvedProfile = company && resolveEquityProfile(company.profile, secData);
  const chgColor = changeColor(quote.regularMarketChangePercent);
  const isPositive = (quote.regularMarketChangePercent ?? 0) >= 0;
  const marketStateLabel = quote.marketState === 'REGULAR'
    ? 'MARKET OPEN'
    : quote.marketState === 'PRE'
      ? 'PRE-MARKET'
      : quote.marketState === 'POST'
        ? 'AFTER-HOURS'
        : quote.marketState === 'CLOSED' ? 'MARKET CLOSED' : 'SESSION UNAVAILABLE';
  const descriptorLine = isFund
    ? [workbench.fund?.family, workbench.fund?.categoryName, quote.exchange].filter(Boolean).join(' | ')
    : [resolvedProfile?.profile.sector, resolvedProfile?.profile.industry, resolvedProfile?.profile.country].filter(Boolean).join(' | ');

  const fiftyTwoRange = quote.fiftyTwoWeekHigh > quote.fiftyTwoWeekLow
    ? ((quote.regularMarketPrice - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100
    : null;
  const dayRange = quote.regularMarketDayHigh > quote.regularMarketDayLow
    ? ((quote.regularMarketPrice - quote.regularMarketDayLow) / (quote.regularMarketDayHigh - quote.regularMarketDayLow)) * 100
    : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {error && <div role="status" className="px-4 py-2 text-xs text-terminal-negative">Refresh failed. Showing the last available research data. <button className="underline" onClick={refreshResearch}>Retry</button></div>}
      {!isIndex && secError && secData && <div role="status" className="px-4 py-2 text-xs text-terminal-muted">SEC refresh failed. Showing the last available filings and metrics.</div>}
      {!isIndex && financialsError && tab === 'financials' && <div role="alert" className="px-4 py-2 text-xs text-terminal-negative">Financial statements could not be refreshed. Available SEC filings remain separate from these estimates.</div>}
      <div className="instrument-section bg-terminal-panel panel-border-b px-3 sm:px-4 py-3 flex-shrink-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <SymbolHeading className="workspace-title">{quote.symbol}</SymbolHeading>
              <span className="text-terminal-muted text-[11px] sm:text-xs bg-terminal-elevated px-2 py-0.5 rounded">
                {workbench.instrumentLabel}
              </span>
              {quote.exchange && <span className="text-terminal-faint text-[11px] sm:text-xs">{quote.exchange}</span>}
              <span className="text-terminal-faint text-[11px] sm:text-xs">{isIndex ? 'INDEX POINTS' : quote.currency}</span>
              {!isFund && sectorQuote && sectorEtf && (
                <button
                  onClick={() => setActivePanel('equity', sectorEtf)}
                  className="text-terminal-accent text-[11px] sm:text-xs hover:underline"
                >
                  {sectorEtf} <span className={changeColor(sectorQuote.regularMarketChangePercent)}>{fmt.pct(sectorQuote.regularMarketChangePercent)}</span>
                </button>
              )}
            </div>
            <div className="text-terminal-text text-sm sm:text-base leading-tight">{quote.longName ?? quote.shortName}</div>
            {descriptorLine && <div className="text-terminal-faint text-[11px] sm:text-xs mt-0.5 leading-relaxed">{descriptorLine}</div>}
          </div>

          <div className="flex items-center gap-2 sm:justify-end">
            <button type="button" onClick={refreshResearch} disabled={isFetching || fetchingSec || fetchingFinancials}
              aria-label={isIndex ? 'Refresh index research' : 'Refresh company research'} className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-2 py-1.5 text-xs text-terminal-text hover:bg-terminal-hover disabled:opacity-60">
              <RefreshCw size={12} />Refresh
            </button>
            <button
              onClick={() => (inWatchlist ? removeFromWatchlist(selectedSymbol) : addToWatchlist(selectedSymbol))}
              className={`p-1.5 rounded hover:bg-terminal-hover transition-colors ${inWatchlist ? 'text-terminal-accent' : 'text-terminal-faint'}`}
              title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {inWatchlist ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
            </button>
            {!embedded && (
              <button
                onClick={() => (onOpenParallel ?? openMultiAssetView)(selectedSymbol, 'research')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-elevated border border-terminal-border rounded hover:bg-terminal-hover transition-colors text-xs text-terminal-text"
              >
                <Plus size={12} />
                PARALLEL
              </button>
            )}
            {embedded && (
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent transition-colors text-xs"
                aria-current="page"
              >
                <FileText size={12} />
                RESEARCH
              </button>
            )}
            <button
              onClick={() => {
                if (onSwitchView) {
                  onSwitchView('chart');
                  return;
                }
                setActivePanel('chart', selectedSymbol);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-elevated border border-terminal-border rounded hover:bg-terminal-hover transition-colors text-xs text-terminal-text"
            >
              <BarChart2 size={12} />
              CHART
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          <div>
            <div className="instrument-value text-terminal-text font-bold tabular-nums" style={{ fontSize: 'clamp(1.75rem, 6vw, 2rem)', lineHeight: 1 }}>
              {fmt.price(quote.regularMarketPrice)}
            </div>
            <div className={`flex flex-wrap items-center gap-2 mt-1 ${chgColor}`}>
              <span className="font-bold tabular-nums text-xs sm:text-sm">
                {fmt.change(quote.regularMarketChange)} ({fmt.pct(quote.regularMarketChangePercent)})
              </span>
              {isPositive ? <TrendingUp size={14} /> : null}
              <span className={`text-[11px] sm:text-xs px-1.5 py-0.5 rounded ${isPositive ? 'bg-terminal-positive-dim' : 'bg-terminal-negative-dim'}`}>
                {marketStateLabel}
              </span>
            </div>
          </div>

          {quote.marketState !== 'REGULAR' && (
            <div className="sm:ml-4 pb-1">
              {quote.preMarketPrice && (
                <div className="text-xs text-terminal-muted">
                  Pre-mkt: <span className="text-terminal-text">{fmt.price(quote.preMarketPrice)}</span>{' '}
                  <span className={changeColor(quote.preMarketChangePercent)}>{fmt.pct(quote.preMarketChangePercent)}</span>
                </div>
              )}
              {quote.postMarketPrice && (
                <div className="text-xs text-terminal-muted">
                  After-hrs: <span className="text-terminal-text">{fmt.price(quote.postMarketPrice)}</span>{' '}
                  <span className={changeColor(quote.postMarketChangePercent)}>{fmt.pct(quote.postMarketChangePercent)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <RangeBar label="Day Range" low={quote.regularMarketDayLow} high={quote.regularMarketDayHigh} pct={dayRange} />
          <RangeBar label="52-Week Range" low={quote.fiftyTwoWeekLow} high={quote.fiftyTwoWeekHigh} pct={fiftyTwoRange} />
        </div>
      </div>

      {!isIndex && <div className="flex flex-col gap-2 px-3 sm:px-4 py-2 panel-border-b bg-terminal-bg flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`px-2.5 py-1 text-[11px] sm:text-xs rounded border transition-colors whitespace-nowrap ${
                tab === item.key
                  ? 'border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent'
                  : 'border-transparent text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!isFund && tab === 'financials' && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {(['annual', 'quarterly'] as FinancialPeriodType[]).map((value) => (
              <button
                key={value}
                onClick={() => setPeriodType(value)}
                className={`px-2 py-0.5 text-[11px] sm:text-xs rounded transition-colors whitespace-nowrap ${
                  periodType === value
                    ? 'bg-terminal-accent/15 text-terminal-accent'
                    : 'text-terminal-faint hover:text-terminal-text hover:bg-terminal-hover'
                }`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>}

      <div className="flex-1 overflow-y-auto">
        {isIndex ? <IndexOverview quote={quote} /> : isFund ? (
          <>
            {tab === 'overview' && <FundOverviewTab workbench={workbench} />}
            {tab === 'performance' && <FundPerformanceTab workbench={workbench} />}
            {tab === 'holdings' && <FundHoldingsTab workbench={workbench} />}
            {tab === 'details' && <FundDetailsTab workbench={workbench} />}
          </>
        ) : (
          <>
            {tab === 'overview' && resolvedProfile && <OverviewTab workbench={workbench} resolvedProfile={resolvedProfile} sectorQuote={sectorQuote} secData={secData} loadingSec={loadingSec} />}
            {tab === 'financials' && <FinancialsTab financials={financials} loading={loadingFinancials} currency={quote.currency} />}
            {tab === 'analysis' && <AnalysisTab workbench={workbench} />}
            {tab === 'ownership' && <OwnershipTab workbench={workbench} secData={secData} loadingSec={loadingSec} />}
            {tab === 'calls' && hasCompanyCalls && <EarningsCalls symbol={selectedSymbol} />}
          </>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  workbench,
  resolvedProfile,
  sectorQuote,
  secData,
  loadingSec,
}: {
  workbench: CompanyWorkbench;
  resolvedProfile: ReturnType<typeof resolveEquityProfile>;
  sectorQuote: CompanyWorkbench['quote'] | null | undefined;
  secData?: SecCompanyData;
  loadingSec: boolean;
}) {
  const { quote, calendar, analysis, sectorContext } = workbench;
  const { profile, sourceFields, sourceUrl } = resolvedProfile;
  const description = profile.longBusinessSummary?.trim();

  return (
    <div className="section-stack p-3 sm:p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricRow label="Market Cap" value={quote.marketCap == null ? '—' : quote.currency ? formatCompactCurrency(quote.marketCap, quoteCurrencyUnit(quote.currency).currency) : fmt.number(quote.marketCap, 0)} />
        <MetricRow label="P/E Ratio (TTM)" value={fmt.number(quote.trailingPE)} />
        <MetricRow label="P/E Ratio (Fwd)" value={fmt.number(quote.forwardPE)} />
        <MetricRow label="Revenue Growth" value={formatRatio(analysis.revenueGrowth)} change={analysis.revenueGrowth} />
        <MetricRow label="Earnings Growth" value={formatRatio(analysis.earningsGrowth)} change={analysis.earningsGrowth} />
        <MetricRow label="ROE" value={formatRatio(analysis.returnOnEquity)} />
        <MetricRow label="Volume" value={fmt.volume(quote.regularMarketVolume)} />
        <MetricRow label="Avg Volume" value={fmt.volume(quote.averageVolume)} />
        <MetricRow label="Total Cash" value={formatCompactCurrency(analysis.totalCash, quote.currency)} />
        <MetricRow label="Total Debt" value={formatCompactCurrency(analysis.totalDebt, quote.currency)} />
        <MetricRow label="Free Cash Flow" value={formatCompactCurrency(analysis.freeCashflow, quote.currency)} />
        <MetricRow label="Overall Risk" value={profile.overallRisk != null ? fmt.number(profile.overallRisk, 0) : '--'} />
      </div>

      <SecMetricsCard data={secData} loading={loadingSec} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">COMPANY PROFILE</div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-terminal-muted mb-3">
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-terminal-accent hover:underline">
                <Globe size={11} />
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {profile.country && <span>{profile.country}</span>}
            {profile.city && <span>{profile.city}{profile.state ? `, ${profile.state}` : ''}</span>}
            {profile.fullTimeEmployees != null && (
              <span className="inline-flex items-center gap-1">
                <Users size={11} />
                {fmt.integer(profile.fullTimeEmployees)} employees
              </span>
            )}
          </div>
          {description ? <p className="text-terminal-text text-xs leading-relaxed">{description}</p> : (
            <div className="space-y-1 text-xs text-terminal-muted">
              {secData?.identity?.verified && <p>Registered company: {secData.identity.title}</p>}
              <p>{secData?.financialFiling ? <FilingLink filing={secData.financialFiling} /> : 'Company description unavailable.'}</p>
            </div>
          )}
          {sourceFields.length > 0 && sourceUrl && <p className="mt-2 text-[11px] text-terminal-muted">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-terminal-accent hover:underline">SEC registrant details</a>
            {' · '}{sourceFields.join(', ')}
          </p>}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">SECTOR CONTEXT</div>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-terminal-faint">Sector</div>
              <div className="text-terminal-text font-bold">{sectorContext.sector ?? '--'}</div>
            </div>
            <div>
              <div className="text-terminal-faint">Industry</div>
              <div className="text-terminal-text font-bold">{profile.industry ?? '--'}</div>
            </div>
            <div>
              <div className="text-terminal-faint">Sector ETF</div>
              <div className="text-terminal-text font-bold">
                {sectorContext.sectorEtf ?? '--'}
                {sectorQuote && (
                  <span className={`ml-2 ${changeColor(sectorQuote.regularMarketChangePercent)}`}>
                    {fmt.pct(sectorQuote.regularMarketChangePercent)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">CALENDAR & FORECASTS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <InfoStat label="Next Earnings" value={formatDate(calendar?.earningsDate)} />
            <InfoStat label="EPS Estimate" value={calendar?.earningsAverage != null ? fmt.number(calendar.earningsAverage) : '--'} />
            <InfoStat label="Revenue Estimate" value={calendar?.revenueAverage != null ? formatCompactCurrency(calendar.revenueAverage, quote.currency) : '--'} />
            <InfoStat label="Ex-Dividend" value={formatDate(calendar?.exDividendDate)} />
            <InfoStat label="Dividend Pay Date" value={formatDate(calendar?.dividendDate)} />
            <InfoStat label="Earnings Date Type" value={calendar?.isEarningsDateEstimate ? 'Estimated' : 'Confirmed'} />
          </div>
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">EXECUTIVE TEAM</div>
          {profile.officers.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live executive data available.</div>
          ) : (
            <div className="space-y-2">
              {profile.officers.map((officer) => (
                <div key={`${officer.name}-${officer.title}`} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="text-terminal-text font-bold">{officer.name}</div>
                    <div className="text-terminal-faint">{officer.title}</div>
                  </div>
                  <div className="text-right text-terminal-muted">
                    {officer.age ? <div>Age {officer.age}</div> : null}
                    {officer.totalPay ? <div>{formatCompactCurrency(officer.totalPay, quote.currency)}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SEC_METRIC_ORDER: SecMetricKey[] = ['revenue', 'operatingIncome', 'netIncome', 'cash', 'debt'];

function secStatusLabel(status: SecCompanyData['status']): string {
  switch (status) {
    case 'ready': return 'READY';
    case 'stale': return 'STALE CACHE';
    case 'partial': return 'PARTIAL';
    case 'unsupported': return 'UNSUPPORTED';
    case 'rate-limit': return 'RATE LIMITED';
    case 'error': return 'UNAVAILABLE';
  }
}

function FilingLink({ filing }: { filing: SecFiling }) {
  const label = filing.form.startsWith('424B') ? 'Read prospectus'
    : filing.form.startsWith('6-K') && filing.documentDescription ? 'Read financial statements' : 'Read financial filing';
  return <a href={filing.filingUrl} target="_blank" rel="noopener noreferrer" title={filing.documentDescription}
    className="text-terminal-accent underline underline-offset-2">{label} · {filing.form} · {formatDate(filing.filedDate)}</a>;
}

function SecMetricsCard({ data, loading }: { data?: SecCompanyData; loading: boolean }) {
  const hasMetrics = SEC_METRIC_ORDER.some(key => data?.metrics[key]?.availability === 'reported');
  const unavailable = data?.factsCoverage === 'unavailable' || data?.cache.facts === 'unavailable';
  return (
    <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark size={12} className="text-terminal-accent" />
          <span className="text-terminal-muted text-xs font-bold tracking-wider">SEC EDGAR REPORTED METRICS</span>
        </div>
        <span className="text-terminal-faint text-[10px]">SOURCE: SEC</span>
      </div>
      {loading ? (
        <div className="p-4 text-terminal-faint text-xs">Loading verified SEC identity and reported facts…</div>
      ) : !data ? (
        <div className="p-4 text-terminal-muted text-xs">SEC data could not be loaded. Use Refresh to try again.</div>
      ) : data.status === 'unsupported' ? (
        <div className="p-4 text-terminal-faint text-xs">SEC does not list this instrument in its verified ticker mapping.</div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-terminal-faint">
            <span className={data.status === 'ready' && hasMetrics ? 'text-terminal-positive' : data.status === 'rate-limit' ? 'text-terminal-negative' : 'text-terminal-accent'}>
              {data.status === 'ready' && !hasMetrics && !unavailable ? 'NO MATCHING TAGS' : secStatusLabel(data.status)}
            </span>
            {data.identity && <span>CIK {data.identity.cik}</span>}
          </div>
          {hasMetrics ? <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {SEC_METRIC_ORDER.map((metric) => {
              const observation = data.metrics[metric];
              return (
                <div key={metric} className="instrument-section bg-terminal-elevated border border-terminal-border rounded p-2">
                  <div className="text-terminal-faint text-[10px]">{observation?.label ?? metric}</div>
                  <div className="text-terminal-text text-sm font-bold tabular-nums mt-1">
                    {formatSecObservation(observation)}
                  </div>
                  <div className="text-terminal-faint text-[10px] mt-1">
                    {observation?.availability === 'reported'
                      ? `${observation.periodType.toUpperCase()} · ${formatDate(observation.reportPeriodEnd ?? undefined)}`
                      : 'No matching SEC tag'}
                  </div>
                </div>
              );
            })}
          </div> : <p className="text-xs leading-relaxed text-terminal-muted">
            {unavailable
              ? 'The SEC Company Facts feed could not be retrieved. Use Refresh to check again.'
              : 'The SEC Company Facts feed has no matching tagged values for the five metrics Charlie tracks. Financial statements can still be available in the company’s filings.'}
          </p>}
          {data.financialFiling
            ? <div className="text-xs"><FilingLink filing={data.financialFiling} /></div>
            : !hasMetrics && data.identity?.verified && <a href={`https://www.sec.gov/edgar/browse/?CIK=${data.identity.cik}`} target="_blank"
                rel="noopener noreferrer" className="text-xs text-terminal-accent underline">Browse company filings on EDGAR</a>}
          {data.warnings.length > 0 && !unavailable && <div className="text-terminal-faint text-[10px]">Some SEC data could not be refreshed.</div>}
        </div>
      )}
    </div>
  );
}

function formatSecObservation(observation: SecMetricObservation | null | undefined): string {
  if (!observation || observation.availability === 'missing' || observation.value == null) return '—';
  if (observation.unit === 'USD') return formatCompactCurrency(observation.value, 'USD');
  return `${fmt.number(observation.value)} ${observation.unit ?? ''}`.trim();
}

function UnifiedFilingsCard({
  yahooFilings,
  data,
  loading,
}: {
  yahooFilings: CompanyWorkbench['filings'];
  data?: SecCompanyData;
  loading: boolean;
}) {
  const filings = mergeCompanyFilings(yahooFilings, data?.filings ?? []).slice(0, 12);
  const hasSecStatus = Boolean(data && data.status !== 'ready' && data.status !== 'unsupported');

  return (
    <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
      <div className="px-4 py-2 panel-border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText size={12} className="text-terminal-accent" />
          <span className="text-terminal-muted text-xs font-bold tracking-wider">LATEST FILINGS</span>
        </div>
        <span className="text-terminal-faint text-[10px]">{filings.length} ITEMS</span>
      </div>
      {loading && filings.length === 0 ? (
        <div className="p-4 text-terminal-faint text-xs">Loading latest filings…</div>
      ) : filings.length === 0 ? (
        <div className="p-4 text-terminal-faint text-xs">No latest filing evidence is available.</div>
      ) : (
        <div className="divide-y divide-terminal-border/40">
          {filings.map((filing) => (
            <a
              key={`${filing.form}-${filing.date}-${filing.accessionNumber ?? filing.url}`}
              href={filing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-3 hover:bg-terminal-hover transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-terminal-text text-xs font-bold">{filing.form}</div>
                <div className="text-terminal-faint text-xs">{formatDate(filing.date)}</div>
              </div>
              <div className="text-terminal-muted text-xs mt-1">
                {filing.title ?? `${filing.form} filing`}
                {filing.reportPeriod ? ` · Report period ${formatDate(filing.reportPeriod)}` : ''}
                {filing.accessionNumber ? ` · ${filing.accessionNumber}` : ''}
              </div>
              <div className="text-terminal-faint text-[10px] mt-1">
                {filing.exhibitCount} exhibits{filing.isAmendment ? ' · AMENDMENT' : ''}
              </div>
            </a>
          ))}
        </div>
      )}
      {(hasSecStatus || loading) && (
        <div className="px-4 py-2 panel-border-t text-terminal-faint text-[10px]">
          {loading ? 'UPDATING' : secStatusLabel(data!.status)} · Filing coverage may be incomplete or delayed; available rows are shown.
        </div>
      )}
    </div>
  );
}

function FinancialsTab({
  financials,
  loading,
  currency,
}: {
  financials: CompanyFinancials | undefined;
  loading: boolean;
  currency: string;
}) {
  return (
    <div className="section-stack p-3 sm:p-4 space-y-4">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="shimmer h-24 rounded" />
          ))}
        </div>
      ) : !financials ? (
        <NoDataBlock text="No live fundamentals are available for this symbol." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {financials.cards.map((card) => (
              <MetricRow
                key={card.label}
                label={card.label}
                value={
                  card.format === 'percent'
                    ? formatRatio(card.value)
                    : card.format === 'currency'
                      ? formatCompactCurrency(card.value, currency)
                      : card.value != null
                        ? fmt.number(card.value)
                        : '--'
                }
              />
            ))}
          </div>

          {financials.sections.map((section) => (
            <div key={section.key} className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
              <div className="px-4 py-2 panel-border-b">
                <span className="text-terminal-muted text-xs font-bold tracking-wider">{section.label}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left">LINE ITEM</th>
                      {financials.periods.map((period) => (
                        <th key={period.date}>{period.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="text-terminal-muted">{row.label}</td>
                        {row.values.map((value, index) => (
                          <td key={`${row.key}-${financials.periods[index]?.date}`} className="tabular-nums">
                            {formatStatementValue(row.key, value, currency)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AnalysisTab({ workbench }: { workbench: CompanyWorkbench }) {
  const { analysis, quote } = workbench;

  return (
    <div className="section-stack p-3 sm:p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricRow label="Target Low" value={formatCompactCurrency(analysis.targetLowPrice, quote.currency)} />
        <MetricRow label="Target Mean" value={formatCompactCurrency(analysis.targetMeanPrice, quote.currency)} />
        <MetricRow label="Target High" value={formatCompactCurrency(analysis.targetHighPrice, quote.currency)} />
        <MetricRow label="Recommendation" value={analysis.recommendationKey?.toUpperCase() ?? '--'} />
        <MetricRow label="Reco Mean" value={analysis.recommendationMean != null ? fmt.number(analysis.recommendationMean, 2) : '--'} />
        <MetricRow label="Analyst Opinions" value={analysis.analystOpinionCount != null ? fmt.integer(analysis.analystOpinionCount) : '--'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">RECOMMENDATION TREND</div>
          {analysis.recommendationTrend.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live analyst distribution available.</div>
          ) : (
            <div className="space-y-3">
              {analysis.recommendationTrend.map((point) => {
                const total = point.strongBuy + point.buy + point.hold + point.sell + point.strongSell;
                const segments = [
                  { label: 'SB', value: point.strongBuy, className: 'bg-terminal-positive' },
                  { label: 'B', value: point.buy, className: 'bg-terminal-positive/60' },
                  { label: 'H', value: point.hold, className: 'bg-terminal-accent/60' },
                  { label: 'S', value: point.sell, className: 'bg-terminal-negative/70' },
                  { label: 'SS', value: point.strongSell, className: 'bg-terminal-negative' },
                ];

                return (
                  <div key={point.period}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-terminal-text font-bold">{point.period}</span>
                      <span className="text-terminal-faint">{total} analysts</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-terminal-elevated">
                      {segments.map((segment) => (
                        <div
                          key={segment.label}
                          className={`instrument-meter ${segment.className}`}
                          style={{ width: `${total ? (segment.value / total) * 100 : 0}%` }}
                          title={`${segment.label}: ${segment.value}`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-1 text-[10px] text-terminal-faint">
                      {segments.map((segment) => (
                        <span key={segment.label}>{segment.label} {segment.value}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">TECHNICAL OUTLOOK</div>
          {analysis.technicalOutlooks.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live technical outlook is available.</div>
          ) : (
            <div className="space-y-3">
              {analysis.technicalOutlooks.map((outlook) => (
                <div key={outlook.label} className="instrument-section bg-terminal-elevated border border-terminal-border rounded p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-terminal-text font-bold">{outlook.label}</span>
                    <span className={outlook.direction === 'Bullish' ? 'text-terminal-positive' : outlook.direction === 'Bearish' ? 'text-terminal-negative' : 'text-terminal-accent'}>
                      {outlook.direction}
                    </span>
                  </div>
                  <div className="text-terminal-faint text-xs mt-1">{outlook.scoreDescription}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs">
                    <InfoStat label="Score" value={fmt.number(outlook.score, 0)} />
                    <InfoStat label="Sector" value={outlook.sectorDirection ?? '--'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">EARNINGS & REVENUE TREND</div>
          {analysis.earningsTrend.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live estimate trend is available.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th className="text-left">PERIOD</th>
                    <th>EPS EST</th>
                    <th>REV EST</th>
                    <th>EPS 30D</th>
                    <th>UP/DOWN 90D</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.earningsTrend.map((point) => (
                    <tr key={point.period}>
                      <td className="text-terminal-accent font-bold">{point.period}</td>
                      <td>{point.earningsEstimate != null ? fmt.number(point.earningsEstimate) : '--'}</td>
                      <td>{point.revenueEstimate != null ? formatCompactCurrency(point.revenueEstimate, quote.currency) : '--'}</td>
                      <td>{point.eps30DaysAgo != null ? fmt.number(point.eps30DaysAgo) : '--'}</td>
                      <td>{point.upLast90days != null || point.downLast90days != null ? `${point.upLast90days ?? 0}/${point.downLast90days ?? 0}` : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">COMPANY VS SECTOR SNAPSHOT</div>
          {analysis.snapshotScores.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live sector snapshot is available.</div>
          ) : (
            <div className="space-y-3">
              {analysis.snapshotScores.map((score) => (
                <div key={score.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-terminal-faint">{score.label}</span>
                    <span className="text-terminal-text font-bold">{score.company ?? '--'} / {score.sector ?? '--'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="h-1.5 bg-terminal-elevated rounded-full overflow-hidden">
                      <div className="instrument-meter h-full bg-terminal-accent rounded-full" style={{ width: `${Math.min(100, (score.company ?? 0) * 10)}%` }} />
                    </div>
                    <div className="h-1.5 bg-terminal-elevated rounded-full overflow-hidden">
                      <div className="instrument-meter h-full bg-terminal-blue rounded-full" style={{ width: `${Math.min(100, (score.sector ?? 0) * 10)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">SIGNIFICANT DEVELOPMENTS</div>
          {analysis.developments.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live development feed is available.</div>
          ) : (
            <div className="space-y-3">
              {analysis.developments.map((development) => (
                <div key={`${development.date}-${development.headline}`} className="border-b border-terminal-border/40 pb-3 last:border-0 last:pb-0">
                  <div className="text-terminal-faint text-xs">{formatDate(development.date)}</div>
                  <div className="text-terminal-text text-xs mt-1">{development.headline}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">RESEARCH REPORTS</div>
          {analysis.reports.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live research reports are available.</div>
          ) : (
            <div className="space-y-3">
              {analysis.reports.map((report) => (
                <div key={`${report.provider}-${report.date}-${report.title}`} className="border-b border-terminal-border/40 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-terminal-text text-xs font-bold">{report.title}</div>
                    <div className="text-terminal-faint text-xs">{formatDate(report.date)}</div>
                  </div>
                  <div className="text-terminal-muted text-xs mt-1">
                    {report.provider}
                    {report.rating ? ` | ${report.rating}` : ''}
                    {report.targetPrice != null ? ` | ${formatCompactCurrency(report.targetPrice, quote.currency)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnershipTab({ workbench, secData, loadingSec }: { workbench: CompanyWorkbench; secData?: SecCompanyData; loadingSec: boolean }) {
  const { ownership, filings, calendar, quote } = workbench;

  return (
    <div className="section-stack p-3 sm:p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricRow label="Insiders Held" value={formatRatio(ownership.insidersPercentHeld)} />
        <MetricRow label="Institutions Held" value={formatRatio(ownership.institutionsPercentHeld)} />
        <MetricRow label="Float Held" value={formatRatio(ownership.institutionsFloatPercentHeld)} />
        <MetricRow label="Institution Count" value={ownership.institutionsCount != null ? fmt.integer(ownership.institutionsCount) : '--'} />
        <MetricRow label="Net Insider Shares" value={ownership.netInsiderShares != null ? fmt.volume(Math.abs(ownership.netInsiderShares)) : '--'} />
        <MetricRow label="Next Earnings" value={formatDate(calendar?.earningsDate)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          <div className="px-4 py-2 panel-border-b flex items-center gap-2">
            <Landmark size={12} className="text-terminal-accent" />
            <span className="text-terminal-muted text-xs font-bold tracking-wider">TOP INSTITUTIONAL HOLDERS</span>
          </div>
          {ownership.institutions.length === 0 ? (
            <div className="p-4 text-terminal-faint text-xs">No live institutional ownership feed is available.</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">ORG</th>
                  <th>% HELD</th>
                  <th>VALUE</th>
                  <th>REPORT</th>
                </tr>
              </thead>
              <tbody>
                {ownership.institutions.map((holder) => (
                  <tr key={`${holder.organization}-${holder.reportDate}`}>
                    <td className="text-terminal-text">{holder.organization}</td>
                    <td>{(holder.pctHeld * 100).toFixed(2)}%</td>
                    <td>{formatCompactCurrency(holder.value, quote.currency)}</td>
                    <td>{formatDate(holder.reportDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          <div className="px-4 py-2 panel-border-b flex items-center gap-2">
            <Users size={12} className="text-terminal-accent" />
            <span className="text-terminal-muted text-xs font-bold tracking-wider">INSIDER ACTIVITY</span>
          </div>
          {ownership.insiders.length === 0 ? (
            <div className="p-4 text-terminal-faint text-xs">No live insider transactions are available.</div>
          ) : (
            <div className="divide-y divide-terminal-border/40">
              {ownership.insiders.map((transaction) => (
                <div key={`${transaction.filerName}-${transaction.startDate}-${transaction.transactionText}`} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-terminal-text text-xs font-bold">{transaction.filerName}</div>
                      <div className="text-terminal-faint text-xs">{transaction.filerRelation ?? 'Insider'}</div>
                    </div>
                    <div className="text-terminal-muted text-xs">{formatDate(transaction.startDate)}</div>
                  </div>
                  <div className="text-terminal-text text-xs mt-2">{transaction.transactionText}</div>
                  <div className="text-terminal-faint text-xs mt-1">
                    {fmt.volume(transaction.shares)} shares
                    {transaction.value != null ? ` | ${formatCompactCurrency(transaction.value, quote.currency)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <UnifiedFilingsCard yahooFilings={filings} data={secData} loading={loadingSec} />
    </div>
  );
}

function FundOverviewTab({ workbench }: { workbench: CompanyWorkbench }) {
  const fund = workbench.fund;
  const { quote } = workbench;

  if (!fund) {
    return <NoDataBlock text="No live fund profile is available for this symbol." />;
  }

  return (
    <div className="section-stack p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricRow label="NAV" value={fund.navPrice != null ? fmt.price(fund.navPrice) : fmt.price(quote.regularMarketPrice)} />
        <MetricRow label="Net Assets" value={formatCompactCurrency(fund.netAssets, quote.currency)} />
        <MetricRow label="Category" value={fund.categoryName ?? '--'} />
        <MetricRow label="Family" value={fund.family ?? '--'} />
        <MetricRow label="Net Expense" value={formatPercentValue(fund.netExpenseRatio, 'auto')} />
        <MetricRow label="Yield" value={formatPercentValue(fund.yield, 'auto')} />
        <MetricRow label="YTD Return" value={formatPercentValue(fund.ytdReturn, 'auto')} change={fund.ytdReturn} />
        <MetricRow label="1Y Return" value={formatPercentValue(fund.oneYearReturn, 'points')} change={fund.oneYearReturn} />
        <MetricRow label="3Y Return" value={formatPercentValue(fund.threeYearReturn, 'points')} change={fund.threeYearReturn} />
        <MetricRow label="5Y Return" value={formatPercentValue(fund.fiveYearReturn, 'points')} change={fund.fiveYearReturn} />
        <MetricRow label="Risk Rating" value={fund.riskRating != null ? fmt.number(fund.riskRating, 0) : '--'} />
        <MetricRow label="Return Rating" value={fund.returnRating != null ? fmt.number(fund.returnRating, 0) : '--'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">FUND PROFILE</div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-terminal-muted mb-3">
            {workbench.profile.website && (
              <a href={workbench.profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-terminal-accent hover:underline">
                <Globe size={11} />
                {workbench.profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {fund.family && <span>{fund.family}</span>}
            {fund.categoryName && <span>{fund.categoryName}</span>}
            {fund.legalType && <span>{fund.legalType}</span>}
          </div>
          <p className="text-terminal-text text-xs leading-relaxed">
            {fund.description ?? workbench.profile.longBusinessSummary ?? 'No live fund description available.'}
          </p>
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">MANAGEMENT & FEES</div>
          <div className="grid grid-cols-1 gap-3 text-xs">
            <InfoStat label="Manager" value={fund.managerName ?? '--'} />
            <InfoStat label="Manager Since" value={formatDate(fund.managerStartDate)} />
            <InfoStat label="Gross Expense" value={formatPercentValue(fund.grossExpenseRatio, 'auto')} />
            <InfoStat label="Turnover" value={formatPercentValue(fund.annualHoldingsTurnover, 'auto')} />
            <InfoStat label="Initial Investment" value={formatCompactCurrency(fund.initialInvestment, quote.currency)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">ASSET MIX</div>
          {fund.assetAllocation.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live asset mix is available.</div>
          ) : (
            <div className="space-y-3">
              {fund.assetAllocation.map((slice) => (
                <ExposureBar key={slice.label} label={slice.label} value={slice.weight} />
              ))}
            </div>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">TOP SECTOR EXPOSURES</div>
          {fund.sectorWeightings.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live sector exposure data is available.</div>
          ) : (
            <div className="space-y-3">
              {fund.sectorWeightings.slice(0, 6).map((sector) => (
                <ExposureBar key={sector.label} label={sector.label} value={sector.weight} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FundPerformanceTab({ workbench }: { workbench: CompanyWorkbench }) {
  const fund = workbench.fund;

  if (!fund) {
    return <NoDataBlock text="No live fund performance data is available for this symbol." />;
  }

  return (
    <div className="section-stack p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricRow label="Fund 1Y" value={formatPercentValue(fund.oneYearReturn, 'points')} change={fund.oneYearReturn} />
        <MetricRow label="Category 1Y" value={formatPercentValue(fund.categoryOneYearReturn, 'points')} change={fund.categoryOneYearReturn} />
        <MetricRow label="Fund 3Y" value={formatPercentValue(fund.threeYearReturn, 'points')} change={fund.threeYearReturn} />
        <MetricRow label="Category 3Y" value={formatPercentValue(fund.categoryThreeYearReturn, 'points')} change={fund.categoryThreeYearReturn} />
        <MetricRow label="Fund 5Y" value={formatPercentValue(fund.fiveYearReturn, 'points')} change={fund.fiveYearReturn} />
        <MetricRow label="Category 5Y" value={formatPercentValue(fund.categoryFiveYearReturn, 'points')} change={fund.categoryFiveYearReturn} />
      </div>

      <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
        <div className="px-4 py-2 panel-border-b">
          <span className="text-terminal-muted text-xs font-bold tracking-wider">TRAILING RETURNS</span>
        </div>
        {fund.trailingReturns.length === 0 ? (
          <div className="p-4 text-terminal-faint text-xs">No live trailing returns are available.</div>
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">PERIOD</th>
                <th>FUND</th>
                <th>CATEGORY</th>
                <th>DELTA</th>
              </tr>
            </thead>
            <tbody>
              {fund.trailingReturns.map((row) => {
                const delta = row.value != null && row.categoryValue != null ? row.value - row.categoryValue : null;
                return (
                  <tr key={row.label}>
                    <td className="text-terminal-accent font-bold">{row.label}</td>
                    <td className={changeColor(row.value)}>{formatPercentValue(row.value, 'points')}</td>
                    <td className={changeColor(row.categoryValue)}>{formatPercentValue(row.categoryValue, 'points')}</td>
                    <td className={changeColor(delta)}>{delta != null ? formatPercentValue(delta, 'points') : '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          <div className="px-4 py-2 panel-border-b">
            <span className="text-terminal-muted text-xs font-bold tracking-wider">ANNUAL TOTAL RETURNS</span>
          </div>
          {fund.annualReturns.length === 0 ? (
            <div className="p-4 text-terminal-faint text-xs">No live annual returns are available.</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">YEAR</th>
                  <th>FUND</th>
                  <th>CATEGORY</th>
                  <th>Q1-Q4</th>
                </tr>
              </thead>
              <tbody>
                {fund.annualReturns.slice().reverse().map((row) => (
                  <tr key={row.year}>
                    <td className="text-terminal-accent font-bold">{row.year}</td>
                    <td className={changeColor(row.annualValue)}>{formatPercentValue(row.annualValue, 'points')}</td>
                    <td className={changeColor(row.categoryAnnualValue)}>{formatPercentValue(row.categoryAnnualValue, 'points')}</td>
                    <td className="text-terminal-muted">
                      {[row.q1, row.q2, row.q3, row.q4].every((value) => value == null)
                        ? '--'
                        : [row.q1, row.q2, row.q3, row.q4].map((value, quarter) => (
                          <Fragment key={quarter}>
                            {quarter > 0 && ' / '}
                            <span className={changeColor(value)}>{formatPercentValue(value, 'points')}</span>
                          </Fragment>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          <div className="px-4 py-2 panel-border-b">
            <span className="text-terminal-muted text-xs font-bold tracking-wider">RISK STATISTICS</span>
          </div>
          {fund.riskStatistics.length === 0 ? (
            <div className="p-4 text-terminal-faint text-xs">No live risk statistics are available.</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">YEAR</th>
                  <th>BETA</th>
                  <th>STD DEV</th>
                  <th>SHARPE</th>
                  <th>MEAN RET</th>
                </tr>
              </thead>
              <tbody>
                {fund.riskStatistics.map((row) => (
                  <tr key={row.year}>
                    <td className="text-terminal-accent font-bold">{row.year}</td>
                    <td>{row.beta != null ? fmt.number(row.beta, 2) : '--'}</td>
                    <td>{formatPercentValue(row.standardDeviation, 'points')}</td>
                    <td>{row.sharpeRatio != null ? fmt.number(row.sharpeRatio, 2) : '--'}</td>
                    <td className={changeColor(row.meanAnnualReturn)}>{formatPercentValue(row.meanAnnualReturn, 'points')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function FundHoldingsTab({ workbench }: { workbench: CompanyWorkbench }) {
  const fund = workbench.fund;

  if (!fund) {
    return <NoDataBlock text="No live fund holdings data is available for this symbol." />;
  }

  return (
    <div className="section-stack p-4 space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
          <div className="px-4 py-2 panel-border-b flex items-center gap-2">
            <Landmark size={12} className="text-terminal-accent" />
            <span className="text-terminal-muted text-xs font-bold tracking-wider">TOP HOLDINGS</span>
          </div>
          {fund.holdings.length === 0 ? (
            <div className="p-4 text-terminal-faint text-xs">No live holding disclosures are available.</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">SYMBOL</th>
                  <th className="text-left">HOLDING</th>
                  <th>WEIGHT</th>
                </tr>
              </thead>
              <tbody>
                {fund.holdings.map((holding) => (
                  <tr key={`${holding.symbol ?? holding.name}-${holding.weight ?? 0}`}>
                    <td className="text-terminal-accent font-bold">{holding.symbol ?? '--'}</td>
                    <td className="text-terminal-text">{holding.name}</td>
                    <td>{formatPercentValue(holding.weight, 'auto')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">SECTOR EXPOSURE</div>
          {fund.sectorWeightings.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live sector weightings are available.</div>
          ) : (
            <div className="space-y-3">
              {fund.sectorWeightings.map((sector) => (
                <ExposureBar key={sector.label} label={sector.label} value={sector.weight} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">ASSET ALLOCATION</div>
          {fund.assetAllocation.length === 0 ? (
            <div className="text-terminal-faint text-xs">No live asset allocation data is available.</div>
          ) : (
            <div className="space-y-3">
              {fund.assetAllocation.map((slice) => (
                <ExposureBar key={slice.label} label={slice.label} value={slice.weight} />
              ))}
            </div>
          )}
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">PORTFOLIO STYLE</div>
          {!fund.equityStyle ? (
            <div className="text-terminal-faint text-xs">No live equity-style factors are available.</div>
          ) : (
            <div className="space-y-3">
              <StyleComparison label="Price / Book" fundValue={fund.equityStyle.priceToBook} categoryValue={fund.equityStyle.categoryPriceToBook} />
              <StyleComparison label="Price / Cash Flow" fundValue={fund.equityStyle.priceToCashflow} categoryValue={fund.equityStyle.categoryPriceToCashflow} />
              <StyleComparison label="Price / Earnings" fundValue={fund.equityStyle.priceToEarnings} categoryValue={fund.equityStyle.categoryPriceToEarnings} />
              <StyleComparison label="Price / Sales" fundValue={fund.equityStyle.priceToSales} categoryValue={fund.equityStyle.categoryPriceToSales} />
              <StyleComparison label="3Y Earnings Growth" fundValue={fund.equityStyle.threeYearEarningsGrowth} categoryValue={fund.equityStyle.categoryThreeYearEarningsGrowth} isPercent />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FundDetailsTab({ workbench }: { workbench: CompanyWorkbench }) {
  const fund = workbench.fund;
  const { quote } = workbench;

  if (!fund) {
    return <NoDataBlock text="No live fund detail feed is available for this symbol." />;
  }

  return (
    <div className="section-stack p-4 space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">MANAGER COMMENTARY</div>
          <div className="space-y-3 text-xs">
            <InfoStat label="Lead Manager" value={fund.managerName ?? '--'} />
            <InfoStat label="Manager Since" value={formatDate(fund.managerStartDate)} />
            <p className="text-terminal-text leading-relaxed">
              {fund.managerBio ?? 'No live manager biography is available.'}
            </p>
          </div>
        </div>

        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4">
          <div className="text-terminal-muted text-xs font-bold tracking-wider mb-3">STRUCTURE & FEES</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <InfoStat label="Legal Type" value={fund.legalType ?? '--'} />
            <InfoStat label="Category" value={fund.categoryName ?? '--'} />
            <InfoStat label="Family" value={fund.family ?? '--'} />
            <InfoStat label="Net Expense" value={formatPercentValue(fund.netExpenseRatio, 'auto')} />
            <InfoStat label="Gross Expense" value={formatPercentValue(fund.grossExpenseRatio, 'auto')} />
            <InfoStat label="Turnover" value={formatPercentValue(fund.annualHoldingsTurnover, 'auto')} />
            <InfoStat label="Net Assets" value={formatCompactCurrency(fund.netAssets, quote.currency)} />
            <InfoStat label="Initial Investment" value={formatCompactCurrency(fund.initialInvestment, quote.currency)} />
          </div>
        </div>
      </div>

      <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-hidden">
        <div className="px-4 py-2 panel-border-b flex items-center gap-2">
          <FileText size={12} className="text-terminal-accent" />
          <span className="text-terminal-muted text-xs font-bold tracking-wider">FUND SNAPSHOT</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4">
          <MetricRow label="Last Price" value={fmt.price(quote.regularMarketPrice)} />
          <MetricRow label="Prev Close" value={fmt.price(quote.regularMarketPreviousClose)} />
          <MetricRow label="52W High" value={fmt.price(quote.fiftyTwoWeekHigh)} />
          <MetricRow label="52W Low" value={fmt.price(quote.fiftyTwoWeekLow)} />
          <MetricRow label="Volume" value={fmt.volume(quote.regularMarketVolume)} />
          <MetricRow label="Avg Volume" value={fmt.volume(quote.averageVolume)} />
          <MetricRow label="Currency" value={quote.currency ?? '--'} />
          <MetricRow label="Exchange" value={quote.exchange ?? '--'} />
        </div>
      </div>
    </div>
  );
}

function ExposureBar({ label, value }: { label: string; value: number | null | undefined }) {
  const pct = normalizePercentValue(value, 'auto');

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-terminal-faint">{label}</span>
        <span className="text-terminal-text font-bold">{formatPercentValue(value, 'auto')}</span>
      </div>
      <div className="h-1.5 bg-terminal-elevated rounded-full overflow-hidden">
        <div className="instrument-meter h-full bg-terminal-accent rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
    </div>
  );
}

function StyleComparison({
  label,
  fundValue,
  categoryValue,
  isPercent = false,
}: {
  label: string;
  fundValue?: number | null;
  categoryValue?: number | null;
  isPercent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-terminal-faint">{label}</span>
        <span className="text-terminal-text font-bold">
          {isPercent ? formatPercentValue(fundValue, 'points') : fundValue != null ? fmt.number(fundValue, 2) : '--'}
          {' / '}
          {isPercent ? formatPercentValue(categoryValue, 'points') : categoryValue != null ? fmt.number(categoryValue, 2) : '--'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="h-1.5 bg-terminal-elevated rounded-full overflow-hidden">
          <div className="instrument-meter h-full bg-terminal-accent rounded-full" style={{ width: `${styleBarWidth(fundValue)}%` }} />
        </div>
        <div className="h-1.5 bg-terminal-elevated rounded-full overflow-hidden">
          <div className="instrument-meter h-full bg-terminal-blue rounded-full" style={{ width: `${styleBarWidth(categoryValue)}%` }} />
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return (
    <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-2.5">
      <div className="text-terminal-faint text-xs mb-1">{label}</div>
      <div className={`font-bold tabular-nums text-sm ${change === undefined ? 'text-terminal-text' : changeColor(change)}`}>{value}</div>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-terminal-faint text-xs mb-1">{label}</div>
      <div className="text-terminal-text text-xs font-bold">{value}</div>
    </div>
  );
}

function RangeBar({ label, low, high, pct }: { label: string; low?: number; high?: number; pct: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-terminal-faint">{label}</span>
        <span className="text-terminal-muted tabular-nums">
          {fmt.price(low)} - {fmt.price(high)}
        </span>
      </div>
      <div className="h-1.5 bg-terminal-elevated rounded-full overflow-hidden">
        <div className="instrument-meter h-full bg-gradient-to-r from-terminal-negative via-terminal-accent to-terminal-positive rounded-full" style={{ width: '100%' }} />
      </div>
      {pct != null && (
        <div className="relative h-2 mt-0.5">
          <div
            className="absolute top-0 w-2 h-2 bg-terminal-text rounded-full -translate-x-1/2 border border-terminal-bg"
            style={{ left: `${Math.max(2, Math.min(98, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatRatio(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function normalizePercentValue(
  value: number | null | undefined,
  mode: 'ratio' | 'points' | 'auto' = 'auto'
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (mode === 'ratio') return value * 100;
  if (mode === 'points') return value;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatPercentValue(
  value: number | null | undefined,
  mode: 'ratio' | 'points' | 'auto' = 'auto',
  decimals = 1
): string {
  const normalized = normalizePercentValue(value, mode);
  if (normalized == null) return '--';
  return `${normalized.toFixed(decimals)}%`;
}

function formatDate(value?: string): string {
  if (!value) return '--';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined,
  });
}

function formatStatementValue(rowKey: string, value: number | null, currency: string): string {
  if (value == null || Number.isNaN(value)) return '--';
  if (rowKey === 'basicEps') return fmt.number(value);
  return formatCompactCurrency(value, currency);
}

function formatCompactCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '--';
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);

  let compact = absolute.toLocaleString('en-US');
  if (absolute >= 1e12) compact = `${(absolute / 1e12).toFixed(2)}T`;
  else if (absolute >= 1e9) compact = `${(absolute / 1e9).toFixed(2)}B`;
  else if (absolute >= 1e6) compact = `${(absolute / 1e6).toFixed(2)}M`;
  else if (absolute >= 1e3) compact = `${(absolute / 1e3).toFixed(1)}K`;
  else compact = absolute.toFixed(2);

  return currency === 'USD' ? `${sign}$${compact}` : `${sign}${currency} ${compact}`;
}

function styleBarWidth(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  const absolute = Math.abs(value);
  if (absolute <= 1) return absolute * 100;
  if (absolute <= 10) return absolute * 10;
  return Math.min(100, absolute);
}

function NoDataBlock({ text }: { text: string }) {
  return (
    <div className="instrument-card bg-terminal-panel border border-terminal-border rounded p-4 text-terminal-faint text-xs">
      {text}
    </div>
  );
}

function LoadingState({ symbol }: { symbol: string }) {
  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="shimmer h-24 rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, index) => <div key={index} className="shimmer h-12 rounded" />)}
      </div>
      <div className="text-terminal-faint text-xs">Loading {symbol} research workspace...</div>
    </div>
  );
}

function ErrorState({ symbol, onRetry }: { symbol: string; onRetry: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="text-terminal-negative text-lg font-bold mb-2">DATA NOT FOUND</div>
        <div className="text-terminal-muted text-sm">Could not load live research data for <span className="text-terminal-accent">{symbol}</span></div>
        <div className="text-terminal-faint text-xs mt-2">Check the symbol or try the data source again.</div>
        <button className="mt-3 rounded border border-terminal-border px-3 py-1 text-terminal-accent" onClick={onRetry}>Retry</button>
      </div>
    </div>
  );
}

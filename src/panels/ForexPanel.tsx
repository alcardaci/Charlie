import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, RefreshCw, X } from 'lucide-react';
import { fetchForexPairs } from '../api/finance';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';
import { parseCurrencyAmount } from '../utils/marketPanelDisplay';

const CURRENCY_OPTIONS = [
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'BRL', label: 'Brazilian Real' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'DKK', label: 'Danish Krone' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'HKD', label: 'Hong Kong Dollar' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'MXN', label: 'Mexican Peso' },
  { code: 'NOK', label: 'Norwegian Krone' },
  { code: 'NZD', label: 'New Zealand Dollar' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'USD', label: 'US Dollar' },
] as const;

function parseStoredPair(pair: string): { base: string; quote: string } | null {
  const [base, quote] = pair.split('/');
  if (!base || !quote || base.length !== 3 || quote.length !== 3 || base === quote) return null;
  return { base, quote };
}

function pairKey(base: string, quote: string) {
  return `${base}/${quote}`;
}

function quoteDecimals(currency: string) {
  return ['JPY', 'INR', 'CNY', 'MXN', 'BRL', 'HKD', 'SEK', 'NOK', 'DKK'].includes(currency) ? 3 : 4;
}

function formatMoney(value: number | null, currency: string) {
  if (value == null || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 1000 ? 2 : 4,
    }).format(value);
  } catch {
    return `${value.toFixed(value >= 1000 ? 2 : 4)} ${currency}`;
  }
}

export function ForexPanel() {
  const { setActivePanel, forexPairs, setForexPairs } = useTerminalStore();
  const [newBase, setNewBase] = useState('DKK');
  const [newQuote, setNewQuote] = useState('EUR');
  const [convertBase, setConvertBase] = useState('EUR');
  const [convertQuote, setConvertQuote] = useState('USD');
  const [amountInput, setAmountInput] = useState('1000');

  const displayedPairs = useMemo(
    () => forexPairs.map(parseStoredPair).filter((pair): pair is { base: string; quote: string } => Boolean(pair)),
    [forexPairs]
  );

  const queryPairs = useMemo(() => {
    const unique = new Map<string, { base: string; quote: string }>();
    displayedPairs.forEach((pair) => unique.set(pairKey(pair.base, pair.quote), pair));

    if (convertBase !== convertQuote) {
      unique.set(pairKey(convertBase, convertQuote), { base: convertBase, quote: convertQuote });
    }

    return Array.from(unique.values());
  }, [displayedPairs, convertBase, convertQuote]);

  const { data: quotes = [], isLoading, refetch, isFetching, isError, dataUpdatedAt } = useQuery({
    queryKey: ['forex-custom', queryPairs],
    queryFn: async () => {
      const result = await fetchForexPairs(queryPairs);
      if (queryPairs.length && !result.length) throw new Error('No currency rates available');
      return result;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    enabled: queryPairs.length > 0,
  });

  const quoteMap = useMemo(
    () => new Map(quotes.map((quote) => [pairKey(quote.base, quote.quote), quote])),
    [quotes]
  );

  const converterQuote = convertBase === convertQuote ? null : quoteMap.get(pairKey(convertBase, convertQuote));
  const parsedAmount = parseCurrencyAmount(amountInput);
  const convertedAmount = parsedAmount == null ? null : convertBase === convertQuote
    ? parsedAmount
    : (converterQuote && Number.isFinite(converterQuote.rate) && converterQuote.rate > 0 ? parsedAmount * converterQuote.rate : null);

  const addPair = () => {
    if (newBase === newQuote) return;
    const nextPair = pairKey(newBase, newQuote);
    setForexPairs([...forexPairs, nextPair]);
  };

  const removePair = (pair: string) => {
    setForexPairs(forexPairs.filter((item) => item !== pair));
  };

  const swapConverter = () => {
    setConvertBase(convertQuote);
    setConvertQuote(convertBase);
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-terminal-accent font-bold text-sm tracking-wider">FOREX — CUSTOM CURRENCY MONITOR</h1>
          <p className="text-terminal-faint text-xs mt-1 leading-relaxed">
            Choose the currency pairs you want to track and convert any amount between supported currencies.
          </p>
        </div>

        <button
          onClick={() => {
            void refetch();
          }}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors text-xs"
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          REFRESH
        </button>
      </div>

      {isError && <div role="status" className="rounded border border-terminal-border bg-terminal-panel p-3 text-xs text-terminal-muted">{quotes.length ? 'Rate refresh failed. Last received rates remain visible.' : 'Currency data is unavailable right now. Use Refresh to try again.'}</div>}
      <div className="text-xs text-terminal-faint">{queryPairs.filter((pair) => quoteMap.has(pairKey(pair.base, pair.quote))).length}/{queryPairs.length} requested rates available · indicative public quotes, not transaction rates. {dataUpdatedAt ? `Checked ${new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.` : ''}</div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.95fr] gap-4">
        <div className="bg-terminal-panel border border-terminal-border rounded p-4 space-y-4">
          <div>
            <div className="text-terminal-muted text-xs font-bold tracking-wider mb-2">TRACKED PAIRS</div>
            <div className="flex flex-wrap gap-2">
              {forexPairs.map((pair) => (
                <div
                  key={pair}
                  className="inline-flex items-center gap-2 rounded border border-terminal-border bg-terminal-elevated px-2 py-1 text-xs"
                >
                  <button
                    onClick={() => {
                      const parsed = parseStoredPair(pair);
                      if (!parsed) return;
                      const quote = quoteMap.get(pair);
                      const chartSymbol = quote?.sourceSymbol && quote.sourceSymbol.endsWith('=X')
                        ? quote.sourceSymbol
                        : null;
                      if (chartSymbol) setActivePanel('chart', chartSymbol);
                    }}
                    className="text-terminal-accent font-bold hover:underline disabled:no-underline disabled:text-terminal-faint"
                    disabled={!quoteMap.get(pair)?.sourceSymbol || !quoteMap.get(pair)?.sourceSymbol?.endsWith('=X')}
                    title={quoteMap.get(pair)?.sourceSymbol?.endsWith('=X') ? 'Open chart' : 'Synthetic cross rate'}
                  >
                    {pair}
                  </button>
                  <button
                    onClick={() => removePair(pair)}
                    className="text-terminal-faint hover:text-terminal-negative transition-colors"
                    title={`Remove ${pair}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-terminal-muted text-xs font-bold tracking-wider block mb-2">BASE</label>
              <select
                value={newBase}
                onChange={(event) => setNewBase(event.target.value)}
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} · {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-terminal-muted text-xs font-bold tracking-wider block mb-2">QUOTE</label>
              <select
                value={newQuote}
                onChange={(event) => setNewQuote(event.target.value)}
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code} · {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={addPair}
                disabled={newBase === newQuote}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent text-xs hover:bg-terminal-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={12} />
                ADD PAIR
              </button>
              <button
                onClick={() => setForexPairs([])}
                className="px-3 py-2 rounded border border-terminal-border text-terminal-muted text-xs hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
              >
                RESET
              </button>
            </div>
          </div>

          <div className="text-[11px] text-terminal-faint">
            Custom crosses like `DKK/EUR` are supported. If Yahoo does not publish the cross directly, the panel synthesizes it from available USD legs.
          </div>
        </div>

        <div className="bg-terminal-panel border border-terminal-border rounded p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={13} className="text-terminal-accent" />
            <div className="text-terminal-muted text-xs font-bold tracking-wider">CURRENCY CONVERTER</div>
          </div>

          <div>
            <label className="text-terminal-muted text-xs font-bold tracking-wider block mb-2">AMOUNT</label>
            <input
              value={amountInput}
              aria-label="Amount to convert"
              aria-invalid={parsedAmount == null}
              onChange={(event) => setAmountInput(event.target.value)}
              className="w-full bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text placeholder-terminal-faint focus:outline-none focus:border-terminal-accent/50"
              placeholder="1000"
              inputMode="decimal"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <div>
              <label className="text-terminal-muted text-xs font-bold tracking-wider block mb-2">FROM</label>
              <select
                value={convertBase}
                onChange={(event) => setConvertBase(event.target.value)}
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={swapConverter}
              className="mb-1 inline-flex items-center justify-center rounded border border-terminal-border px-2 py-2 text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/40 hover:bg-terminal-hover transition-colors"
              title="Swap currencies"
            >
              <ArrowRightLeft size={12} />
            </button>

            <div>
              <label className="text-terminal-muted text-xs font-bold tracking-wider block mb-2">TO</label>
              <select
                value={convertQuote}
                onChange={(event) => setConvertQuote(event.target.value)}
                className="w-full bg-terminal-elevated border border-terminal-border rounded px-3 py-2 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded border border-terminal-border bg-terminal-elevated/60 p-4">
            <div className="text-terminal-faint text-xs">Latest available indicative rate</div>
            <div className="mt-1 text-terminal-text text-lg font-bold tabular-nums">
              {convertBase === convertQuote
                ? `1 ${convertBase} = 1 ${convertQuote}`
                : converterQuote
                  ? `1 ${convertBase} = ${fmt.price(converterQuote.rate, quoteDecimals(convertQuote))} ${convertQuote}`
                  : isFetching ? 'Loading conversion rate…' : 'Conversion rate unavailable'}
            </div>
            <div className="mt-3 text-terminal-faint text-xs">Converted amount</div>
            <div className="mt-1 text-terminal-accent text-2xl font-bold tabular-nums">
              {parsedAmount == null ? 'Enter a valid amount' : formatMoney(convertedAmount, convertQuote)}
            </div>
            <div className="mt-2 text-[11px] text-terminal-faint">
              {convertBase === convertQuote
                ? 'Same-currency conversion uses a 1:1 rate.'
                : converterQuote
                  ? `Using ${converterQuote.sourceSymbol?.includes('·') ? 'synthetic cross pricing' : 'direct market pricing'} for ${convertBase}/${convertQuote}.`
                  : isFetching ? 'Waiting for market data…' : 'No public quote was returned for this pair.'}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="shimmer h-10 rounded" />
          ))}
        </div>
      ) : (
        <div className="bg-terminal-panel border border-terminal-border rounded overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">PAIR</th>
                <th className="text-left hidden md:table-cell">NAME</th>
                <th>RATE</th>
                <th>CHG</th>
                <th>CHG %</th>
                <th>DAY HIGH</th>
                <th>DAY LOW</th>
                <th>52W HIGH</th>
                <th>52W LOW</th>
              </tr>
            </thead>
            <tbody>
              {displayedPairs.map(({ base, quote }) => {
                const key = pairKey(base, quote);
                const pair = quoteMap.get(key);
                const chgColor = changeColor(pair?.changePct);
                const decimals = quoteDecimals(quote);
                const chartable = Boolean(pair?.sourceSymbol && pair.sourceSymbol.endsWith('=X'));

                return (
                  <tr
                    key={key}
                    onClick={() => {
                      if (chartable && pair?.sourceSymbol) setActivePanel('chart', pair.sourceSymbol);
                    }}
                    className={chartable ? 'cursor-pointer' : ''}
                  >
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold ${chartable ? 'text-terminal-accent' : 'text-terminal-text'}`}>
                          {base}/{quote}
                        </span>
                      </div>
                    </td>
                    <td className="text-terminal-muted hidden md:table-cell">{pair?.name ?? key}<div className="text-[10px] text-terminal-faint">{pair ? pair.sourceSymbol?.includes('·') ? 'Synthetic USD cross' : pair.sourceSymbol?.endsWith('=X') ? 'Direct market quote' : 'Derived inverse quote' : 'Rate unavailable'}</div></td>
                    <td className="tabular-nums font-bold text-terminal-text">
                      {pair ? fmt.price(pair.rate, decimals) : '—'}
                    </td>
                    <td className={`tabular-nums ${chgColor}`}>
                      {pair ? fmt.change(pair.change, decimals) : '—'}
                    </td>
                    <td className={`tabular-nums font-bold ${chgColor}`}>
                      {pair ? fmt.pct(pair.changePct) : '—'}
                    </td>
                    <td className="tabular-nums text-terminal-muted">
                      {pair ? fmt.price(pair.regularMarketDayHigh ?? null, decimals) : '—'}
                    </td>
                    <td className="tabular-nums text-terminal-muted">
                      {pair ? fmt.price(pair.regularMarketDayLow ?? null, decimals) : '—'}
                    </td>
                    <td className="tabular-nums text-terminal-positive">
                      {pair ? fmt.price(pair.fiftyTwoWeekHigh ?? null, decimals) : '—'}
                    </td>
                    <td className="tabular-nums text-terminal-negative">
                      {pair ? fmt.price(pair.fiftyTwoWeekLow ?? null, decimals) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

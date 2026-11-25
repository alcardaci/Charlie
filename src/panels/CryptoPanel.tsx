import { useQuery } from '@tanstack/react-query';
import { fetchCryptoMarkets } from '../api/crypto';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';
import { cryptoChartSymbol, finiteMarketValue, trackedMarketCap } from '../utils/marketPanelDisplay';

export function CryptoPanel() {
  const { setActivePanel } = useTerminalStore();

  const { data: coins = [], isLoading, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['crypto-markets'],
    queryFn: () => fetchCryptoMarkets('usd', 50),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const totalMktCap = trackedMarketCap(coins);

  return <>
    <WorkspaceHeader title="CRYPTO MARKETS">
      <div className="text-xs text-terminal-muted">
        Tracked sample cap: <span className="text-terminal-text">{fmt.marketCap(totalMktCap)}</span>
        <span className="text-terminal-faint ml-3">via CoinGecko</span>
      </div>
      <button type="button" onClick={() => void refetch()} disabled={isFetching} className="rounded border border-terminal-border px-3 py-1 text-xs text-terminal-muted hover:text-terminal-text disabled:opacity-50">{isFetching ? 'Refreshing…' : 'Refresh'}</button>
    </WorkspaceHeader>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="text-xs text-terminal-faint mb-3">{coins.length ? `${coins.length} assets returned` : 'Top 50 requested'} · USD · change over rolling 24 hours. Sample shares are not global market dominance. {dataUpdatedAt ? `Checked ${new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.` : ''}</div>
      {isError && <div role="status" className="instrument-section text-terminal-muted border border-terminal-border rounded text-xs p-3 mb-3">{coins.length ? 'Refresh failed; the last received market data remains visible.' : 'CoinGecko data is unavailable or rate-limited. Use Refresh to try again.'}</div>}

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 20 }).map((_, i) => <div key={i} className="shimmer h-10 rounded" />)}
        </div>
      ) : coins.length === 0 ? (
        <div className="text-terminal-faint text-sm p-4">No crypto market data is available.</div>
      ) : (
        <div className="instrument-card bg-terminal-panel border border-terminal-border rounded overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-center w-10">#</th>
                <th className="text-left">NAME</th>
                <th>PRICE (USD)</th>
                <th>24H CHG</th>
                <th>24H CHG %</th>
                <th>MARKET CAP</th>
                <th>24H VOLUME</th>
                <th>24H HIGH</th>
                <th>24H LOW</th>
                <th className="hidden xl:table-cell">SUPPLY</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((coin) => {
                const chgColor = changeColor(finiteMarketValue(coin.price_change_percentage_24h));
                const reportedCap = finiteMarketValue(coin.market_cap);
                const marketCap = reportedCap != null && reportedCap >= 0 ? reportedCap : null;
                const mktCapPct = marketCap != null && marketCap >= 0 && totalMktCap != null && totalMktCap > 0 ? marketCap / totalMktCap * 100 : null;
                const chartSymbol = cryptoChartSymbol(coin);

                return (
                  <tr
                    key={coin.id}
                  >
                    <td className="text-center text-terminal-faint">{coin.market_cap_rank}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <img
                          src={coin.image}
                          alt=""
                          loading="lazy"
                          className="w-5 h-5 rounded-full"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={`https://www.coingecko.com/en/coins/${encodeURIComponent(coin.id)}`} target="_blank" rel="noreferrer" className="text-terminal-accent font-bold hover:underline" title={`Open ${coin.name} at CoinGecko`}>{coin.symbol.toUpperCase()} ↗</a>
                            {chartSymbol && <button type="button" onClick={() => setActivePanel('chart', chartSymbol)} className="text-[10px] text-terminal-muted hover:text-terminal-accent underline">Chart</button>}
                          </div>
                          <div className="text-terminal-faint text-xs hidden md:block">{coin.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular-nums font-bold text-terminal-text">
                      {fmt.usdPrice(finiteMarketValue(coin.current_price))}
                    </td>
                    <td className={`tabular-nums ${chgColor}`}>
                      {fmt.change(finiteMarketValue(coin.price_change_24h))}
                    </td>
                    <td className={`tabular-nums font-bold ${chgColor}`}>
                      {fmt.pct(finiteMarketValue(coin.price_change_percentage_24h))}
                    </td>
                    <td className="tabular-nums text-terminal-muted">
                      <div>{fmt.marketCap(marketCap)}</div>
                      <div className="text-terminal-faint text-xs">{mktCapPct == null ? 'Share unavailable' : `${mktCapPct.toFixed(2)}% of sample`}</div>
                    </td>
                    <td className="tabular-nums text-terminal-muted">{fmt.marketCap(finiteMarketValue(coin.total_volume))}</td>
                    <td className="tabular-nums text-terminal-muted">{fmt.usdPrice(finiteMarketValue(coin.high_24h))}</td>
                    <td className="tabular-nums text-terminal-muted">{fmt.usdPrice(finiteMarketValue(coin.low_24h))}</td>
                    <td className="tabular-nums text-terminal-faint hidden xl:table-cell">
                      {fmt.volume(finiteMarketValue(coin.circulating_supply))} {coin.symbol.toUpperCase()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </>;
}

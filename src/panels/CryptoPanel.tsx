import { useQuery } from '@tanstack/react-query';
import { fetchCryptoMarkets } from '../api/crypto';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmt, changeColor } from '../utils/formatters';

export function CryptoPanel() {
  const { setActivePanel } = useTerminalStore();

  const { data: coins = [], isLoading, error } = useQuery({
    queryKey: ['crypto-markets'],
    queryFn: () => fetchCryptoMarkets('usd', 50),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const totalMktCap = coins.reduce((acc, c) => acc + (c.market_cap ?? 0), 0);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-terminal-accent font-bold text-sm tracking-wider">CRYPTO MARKETS</h1>
        <div className="text-xs text-terminal-muted">
          Total Mkt Cap: <span className="text-terminal-text">{fmt.marketCap(totalMktCap)}</span>
          <span className="text-terminal-faint ml-3">via CoinGecko</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 20 }).map((_, i) => <div key={i} className="shimmer h-10 rounded" />)}
        </div>
      ) : error ? (
        <div className="text-terminal-negative text-sm p-4">Failed to load crypto data. Check your connection.</div>
      ) : (
        <div className="bg-terminal-panel border border-terminal-border rounded overflow-hidden">
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
                const chgColor = changeColor(coin.price_change_percentage_24h);
                const mktCapPct = totalMktCap ? (coin.market_cap / totalMktCap) * 100 : 0;

                return (
                  <tr
                    key={coin.id}
                    onClick={() => setActivePanel('chart', `${coin.symbol.toUpperCase()}-USD`)}
                    className="cursor-pointer"
                  >
                    <td className="text-center text-terminal-faint">{coin.market_cap_rank}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <img
                          src={coin.image}
                          alt={coin.name}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div>
                          <div className="text-terminal-accent font-bold">{coin.symbol.toUpperCase()}</div>
                          <div className="text-terminal-faint text-xs hidden md:block">{coin.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular-nums font-bold text-terminal-text">
                      ${fmt.price(coin.current_price)}
                    </td>
                    <td className={`tabular-nums ${chgColor}`}>
                      {fmt.change(coin.price_change_24h)}
                    </td>
                    <td className={`tabular-nums font-bold ${chgColor}`}>
                      {fmt.pct(coin.price_change_percentage_24h)}
                    </td>
                    <td className="tabular-nums text-terminal-muted">
                      <div>{fmt.marketCap(coin.market_cap)}</div>
                      <div className="text-terminal-faint text-xs">{mktCapPct.toFixed(2)}%</div>
                    </td>
                    <td className="tabular-nums text-terminal-muted">{fmt.marketCap(coin.total_volume)}</td>
                    <td className="tabular-nums text-terminal-positive">${fmt.price(coin.high_24h)}</td>
                    <td className="tabular-nums text-terminal-negative">${fmt.price(coin.low_24h)}</td>
                    <td className="tabular-nums text-terminal-faint hidden xl:table-cell">
                      {fmt.volume(coin.circulating_supply)} {coin.symbol.toUpperCase()}
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

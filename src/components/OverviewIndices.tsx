import type { Quote } from '../types';
import { changeColor, fmt } from '../utils/formatters';
import { DailyCloseSparkline } from './DailyCloseSparkline';
import { OverviewSectionHeader } from './OverviewSectionHeader';
import './OverviewIndices.css';

export function OverviewIndices({ symbols, names, quotes, loading, onSelect }: {
  symbols: readonly string[];
  names: Readonly<Record<string, string>>;
  quotes: readonly Quote[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  return <section className="overview-primary-panel" aria-label="Major indices">
    <OverviewSectionHeader title="MAJOR INDICES" />
    <table className="overview-indices-table" aria-label="Major indices" aria-busy={loading}>
      <thead><tr>
        <th scope="col">Index</th>
        <th scope="col">Last</th>
        <th scope="col">1D move</th>
        <th scope="col" title="Reported daily closes for the last 30 complete calendar days, New York time">30D</th>
      </tr></thead>
      <tbody>{symbols.map((symbol) => {
        const name = names[symbol] ?? symbol;
        const quote = quotes.find(item => item.symbol === symbol);
        return <tr key={symbol} onClick={() => onSelect(symbol)}>
          <th scope="row"><button type="button" aria-label={`Open ${name} in Equity`}>{name}</button></th>
          <td className="overview-index-price">{fmt.price(quote?.regularMarketPrice)}</td>
          <td className="overview-index-move">
            <div className={changeColor(quote?.regularMarketChangePercent)}>{fmt.pct(quote?.regularMarketChangePercent)}</div>
            <div className="overview-index-points" title="Point change">{fmt.change(quote?.regularMarketChange)}</div>
          </td>
          <td><DailyCloseSparkline symbol={symbol} name={name} timeZone="America/New_York" /></td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}

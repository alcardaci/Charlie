import { fetchPublicJson } from '../utils/publicRequests';
import { CryptoAsset } from '../types';

const CG = '/api/coingecko';

export async function fetchCryptoMarkets(currency = 'usd', limit = 30): Promise<CryptoAsset[]> {
  const params = new URLSearchParams({
    vs_currency: currency,
    order: 'market_cap_desc',
    per_page: String(limit),
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h',
  });

  const payload = await fetchPublicJson<unknown>(`${CG}/api/v3/coins/markets?${params}`, { cacheMs: 60_000 });
  if (!Array.isArray(payload)) throw new Error('Invalid crypto market response');
  return payload.filter((item): item is CryptoAsset => item && typeof item.id === 'string' && typeof item.symbol === 'string' && typeof item.name === 'string' && Number.isFinite(item.current_price) && item.current_price > 0);
}

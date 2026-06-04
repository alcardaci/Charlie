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

  const res = await fetch(`${CG}/api/v3/coins/markets?${params}`);
  if (!res.ok) throw new Error('Failed to fetch crypto market data');
  return res.json();
}

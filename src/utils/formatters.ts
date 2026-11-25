const fixedFormats = new Map<number, Intl.NumberFormat>();
function grouped(value: number, decimals: number): string {
  let formatter = fixedFormats.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    fixedFormats.set(decimals, formatter);
  }
  return formatter.format(Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value);
}

export const fmt = {
  price(price: number | undefined | null, decimals?: number): string {
    if (price === undefined || price === null || !Number.isFinite(price)) return '—';
    const absolute = Math.abs(price);
    if (decimals == null && absolute > 0 && absolute < 1e-10) return price.toPrecision(4);
    const d = decimals ?? (absolute > 0 && absolute < 1 ? Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(absolute)))) : absolute < 10 ? 3 : 2);
    return grouped(price, d);
  },

  usdPrice(value: number | null | undefined): string {
    return value != null && Number.isFinite(value) ? `$${fmt.price(value)}` : '—';
  },

  change(change: number | undefined | null, decimals = 2): string {
    if (change === undefined || change === null || !Number.isFinite(change)) return '—';
    const magnitude = grouped(change, decimals);
    return magnitude.startsWith('-') ? magnitude : '+' + magnitude;
  },

  pct(pct: number | undefined | null): string {
    if (pct === undefined || pct === null || !Number.isFinite(pct)) return '—';
    return `${fmt.change(pct, 2)}%`;
  },

  volume(vol: number | undefined | null): string {
    if (vol == null || !Number.isFinite(vol)) return '—';
    if (vol >= 1e12) return `${(vol / 1e12).toFixed(2)}T`;
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toLocaleString('en-US');
  },

  marketCap(cap: number | undefined | null): string {
    if (cap == null || !Number.isFinite(cap)) return '—';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(3)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString('en-US')}`;
  },

  timeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days === 1) return 'Yesterday';
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  date(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  },

  time(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  },

  number(n: number | undefined | null, decimals = 2): string {
    if (n === undefined || n === null || !Number.isFinite(n)) return '—';
    return grouped(n, decimals);
  },

  integer(n: number | undefined | null): string {
    if (n === undefined || n === null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US');
  },
};

export function changeColor(change: number | undefined | null): string {
  if (!change || change === 0) return 'text-terminal-muted';
  return change > 0 ? 'text-terminal-positive' : 'text-terminal-negative';
}

export function changeBg(change: number | undefined | null): string {
  if (!change || change === 0) return '';
  return change > 0 ? 'bg-terminal-positive-dim' : 'bg-terminal-negative-dim';
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const ny = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const weekday = ny.find((p) => p.type === 'weekday')?.value;
  const hour = parseInt(ny.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(ny.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const totalMinutes = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
}

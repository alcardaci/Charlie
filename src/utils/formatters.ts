export const fmt = {
  price(price: number | undefined | null, decimals?: number): string {
    if (price === undefined || price === null || isNaN(price)) return '—';
    const d = decimals ?? (price < 1 ? 4 : price < 10 ? 3 : 2);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(price);
  },

  change(change: number | undefined | null, decimals = 2): string {
    if (change === undefined || change === null || isNaN(change)) return '—';
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${change.toFixed(decimals)}`;
  },

  pct(pct: number | undefined | null): string {
    if (pct === undefined || pct === null || isNaN(pct)) return '—';
    const prefix = pct >= 0 ? '+' : '';
    return `${prefix}${pct.toFixed(2)}%`;
  },

  volume(vol: number | undefined | null): string {
    if (!vol) return '—';
    if (vol >= 1e12) return `${(vol / 1e12).toFixed(2)}T`;
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toLocaleString();
  },

  marketCap(cap: number | undefined | null): string {
    if (!cap) return '—';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(3)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString()}`;
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
    if (n === undefined || n === null || isNaN(n)) return '—';
    return n.toFixed(decimals);
  },

  integer(n: number | undefined | null): string {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return n.toLocaleString();
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

import type { PredictionForecast } from '../types';

type MarketState = { active?: unknown; closed?: unknown; archived?: unknown };

interface PolymarketMarket extends MarketState {
  id?: string | number;
  slug?: string;
  question?: string;
  groupItemTitle?: string;
  negRisk?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  oneDayPriceChange?: unknown;
  volume?: unknown;
  volume24hr?: unknown;
  liquidity?: unknown;
  endDate?: string;
  acceptingOrders?: unknown;
}

export interface PolymarketEvent extends MarketState {
  id?: string | number;
  slug?: string;
  seriesSlug?: string;
  title?: string;
  category?: string;
  subcategory?: string;
  tags?: Array<{ label?: string }> | null;
  markets?: PolymarketMarket[] | null;
  volume24hr?: unknown;
  liquidity?: unknown;
  endDate?: string;
  negRisk?: unknown;
}

const themes = ['Macro', 'Politics', 'Geopolitics', 'Crypto', 'Business'] as const;
const excludedTopics = /\b(sports?|nba|nfl|mlb|nhl|ncaa|champions league|premier league|super bowl|formula 1|f1|ufc|boxing|tennis|golf|soccer|football|baseball|basketball|hockey|cricket|oscars?|grammys?|emmys?|awards?|music|culture|eurovision|survivor|big brother|love island|esports)\b/i;
const themePatterns: Array<[typeof themes[number], RegExp]> = [
  ['Crypto', /\b(bitcoin|btc|ethereum|eth|solana|crypto\w*|tokens?|stablecoins?|memecoins?|dogecoin|xrp)\b/i],
  ['Macro', /\b(fed|fomc|cpi|pce|inflation|gdp|recession|payrolls?|jobs report|unemployment|rate (cuts?|hikes?)|treasur(y|ies)|yields?|econom(y|ic)|macro)\b/i],
  ['Geopolitics', /\b(ukrain\w*|russia\w*|china|taiwan\w*|israel\w*|gaza|iran\w*|tariffs?|ceasefire|wars?|sanctions?|nato|european union|geopolit\w*|middle east)\b/i],
  ['Politics', /\b(elections?|presiden\w*|prime minister|congress|senate|house|governor|mayor|trump|biden|democrat\w*|republican\w*|parliament|politic\w*)\b/i],
  ['Business', /\b(nvidia|tesla|apple|microsoft|openai|earnings|ipo|ai|artificial intelligence|compan(y|ies)|stocks?|nasdaq|s&p 500|business|technology|finance)\b/i],
];

function isFlag(value: unknown, flag: boolean): boolean {
  const expected = flag ? ['true', '1', 'yes'] : ['false', '0', 'no'];
  return expected.includes(String(value).trim().toLowerCase());
}

function isOpen(item: MarketState): boolean {
  return !isFlag(item.active, false) && !isFlag(item.closed, true) && !isFlag(item.archived, true);
}

function numberInRange(value: unknown, min: number, max = Infinity): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function readArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(',').map(part => part.trim());
  }
}

type PricedMarket = PredictionForecast & { yesPrice: number; noPrice: number };
type Choice = { forecast: PricedMarket; label: string | null };
type RankedEvent = { forecast: PricedMarket; tier: number; score: number; activity: number; series: string };

// For a single-winner event, certainty is the favourite's YES price. A 2% candidate's
// 98% NO price says little about whether the overall race is competitive.
function rank(forecast: PricedMarket, series: string, metrics: Pick<PredictionForecast, 'volume24hr' | 'liquidity'> = forecast): RankedEvent | null {
  const dailyVolume = metrics.volume24hr ?? 0;
  const activity = dailyVolume > 0 ? dailyVolume : metrics.liquidity ?? 0;
  if (activity <= 0) return null;
  const strongest = forecast.outcomeGroup ? forecast.yesPrice : Math.max(forecast.yesPrice, forecast.noPrice);
  const openness = Math.min(1, 2 * (1 - strongest));
  // Exhaust genuinely contested events before featuring near-settled ones. Within
  // each band, demonstrated daily trading takes precedence over liquidity alone.
  const tier = (strongest >= 0.95 ? 2 : 0) + (dailyVolume > 0 ? 0 : 1);
  return { forecast, tier, activity, score: Math.log1p(activity) * openness, series };
}

function compare(a: RankedEvent, b: RankedEvent): number {
  return a.tier - b.tier || b.score - a.score || b.activity - a.activity || a.forecast.id.localeCompare(b.forecast.id);
}

function eventCandidate(event: PolymarketEvent, now: number): RankedEvent | null {
  if (!event || !isOpen(event) || !Array.isArray(event.markets)) return null;
  const title = event.title?.trim() || null;
  const tags = Array.isArray(event.tags) ? event.tags.flatMap(tag => tag?.label?.trim() || []) : [];
  const topic = [title, event.category, event.subcategory, ...tags].filter(Boolean).join(' ');
  if (excludedTopics.test(topic)) return null;
  const eventTheme = themePatterns.find(([, pattern]) => pattern.test(topic))?.[0];
  const series = event.seriesSlug?.trim() || '';
  const choices: Choice[] = [];
  for (const market of event.markets) {
    if (!market || !isOpen(market) || isFlag(market.acceptingOrders, false)) continue;
    const endDate = market.endDate || event.endDate || null;
    if (endDate && Date.parse(endDate) <= now) continue;
    const outcomes = readArray(market.outcomes).map(value => String(value).trim().toLowerCase());
    const prices = readArray(market.outcomePrices);
    if (outcomes.length !== 2 || prices.length !== 2) continue;
    const yesIndex = outcomes.indexOf('yes');
    const yesPrice = numberInRange(prices[yesIndex], 0, 1);
    const noPrice = numberInRange(prices[outcomes.indexOf('no')], 0, 1);
    if (yesPrice === null || noPrice === null || (yesPrice === noPrice && (yesPrice === 0 || yesPrice === 1))) continue;
    const question = market.question?.trim() || title;
    if (!question || excludedTopics.test(question)) continue;
    const label = market.groupItemTitle?.trim() || null;
    if (label && /^(?:person|candidate|outcome|player|team)\s+(?:[a-z]{1,2}|\d+)$/i.test(label)) continue;
    const slug = event.slug?.trim() || market.slug?.trim();
    const theme = eventTheme ?? themePatterns.find(([, pattern]) => pattern.test(question))?.[0] ?? (/\bworld\b/i.test(topic) ? 'Geopolitics' : 'Top market');
    const forecast: PricedMarket = {
      id: String(market.id ?? market.slug ?? question), question, eventTitle: title, theme,
      category: event.category ?? null, subcategory: event.subcategory ?? null, tags, endDate,
      yesPrice, noPrice, leadingOutcome: yesPrice >= noPrice ? 'Yes' : 'No', leadingProbability: Math.max(yesPrice, noPrice),
      yesChange24hr: yesIndex === 0 ? numberInRange(market.oneDayPriceChange, -1, 1) : null,
      volume24hr: numberInRange(market.volume24hr, 0), volume: numberInRange(market.volume, 0), liquidity: numberInRange(market.liquidity, 0),
      url: slug ? 'https://polymarket.com/event/' + encodeURIComponent(slug) : null, source: 'Polymarket Gamma API',
    };
    choices.push({ forecast, label: isFlag(market.negRisk, false) ? null : label });
  }
  if (isFlag(event.negRisk, true) && title) {
    const named = choices.filter((choice): choice is Choice & { label: string } => choice.label !== null)
      .sort((a, b) => b.forecast.yesPrice - a.forecast.yesPrice || a.label.localeCompare(b.label));
    if (named.length >= 2) {
      const forecast = named[0].forecast;
      forecast.outcomeGroup = {
        count: named.length,
        endDate: event.endDate || (named.every(choice => choice.forecast.endDate === forecast.endDate) ? forecast.endDate : null),
        outcomes: named.slice(0, 3).map(({ label, forecast: f }) => ({ label, yesPrice: f.yesPrice, yesChange24hr: f.yesChange24hr ?? null })),
        volume24hr: numberInRange(event.volume24hr, 0), liquidity: numberInRange(event.liquidity, 0),
      };
      // Known component activity can qualify the event when Gamma omits its total.
      // Leave the displayed event totals missing instead of publishing a partial sum.
      return rank(forecast, series, {
        volume24hr: forecast.outcomeGroup.volume24hr ?? named.reduce((sum, choice) => sum + (choice.forecast.volume24hr ?? 0), 0),
        liquidity: forecast.outcomeGroup.liquidity ?? named.reduce((sum, choice) => sum + (choice.forecast.liquidity ?? 0), 0),
      });
    }
  }
  const ranked = choices.flatMap(({ forecast }) => rank(forecast, series) ?? []);
  return ranked.sort(compare)[0] ?? null;
}

export function selectPolymarketForecasts(events: PolymarketEvent[], limit: number, now = Date.now()): PredictionForecast[] {
  const ranked = events.flatMap(event => eventCandidate(event, now) ?? []).sort(compare);
  const selected: PredictionForecast[] = [];
  const seenEvents = new Set<string>();
  const seenSeries = new Set<string>();
  function add(row: RankedEvent, allowRepeatedSeries = false): void {
    const key = row.forecast.url ?? row.forecast.eventTitle ?? row.forecast.id;
    if (selected.length >= limit || seenEvents.has(key) || (!allowRepeatedSeries && row.series && seenSeries.has(row.series))) return;
    selected.push(row.forecast);
    seenEvents.add(key);
    if (row.series) seenSeries.add(row.series);
  }

  for (const tier of [0, 1, 2, 3]) {
    const pool = ranked.filter(row => row.tier === tier);
    for (const theme of themes) {
      if (selected.some(item => item.theme === theme)) continue;
      const best = pool.find(row => row.forecast.theme === theme && (!row.series || !seenSeries.has(row.series)));
      if (best) add(best);
    }
    for (const row of pool) add(row);
    for (const row of pool) add(row, true);
    if (selected.length >= limit) break;
  }
  return selected;
}

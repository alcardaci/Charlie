import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import NodeWS from 'ws'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { getCrumbClear } from 'yahoo-finance2/lib/getCrumb'
import {
  DEFAULT_GEOPOLITICS_EVENT_SYSTEM_PROMPT,
  DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT,
  DEFAULT_THEME_DISCOVERY_RECOMMENDATION_SYSTEM_PROMPT,
  DEFAULT_THEME_DISCOVERY_SYSTEM_PROMPT,
  DEFAULT_TOPIC_THEME_GUIDANCE_SYSTEM_PROMPT,
} from './src/utils/openaiConfig'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yf: any = null
const execFileAsync = promisify(execFile)
const KEYCHAIN_ACCOUNT = 'default'
const LOCAL_CONNECTIONS_DIR = join(homedir(), '.charlie')
const LOCAL_CONNECTIONS_PATH = join(LOCAL_CONNECTIONS_DIR, 'connections.json')
type ConnectionProvider = 'openai' | 'fred' | 'finnhub'
const CONNECTION_PROVIDER_CONFIG: Record<ConnectionProvider, {
  service: string
  legacyServices?: readonly string[]
  requiredLabel: string
}> = {
  openai: {
    service: 'Charlie OpenAI API Key',
    legacyServices: ['BTerminal OpenAI API Key'] as const,
    requiredLabel: 'OpenAI API key',
  },
  fred: {
    service: 'Charlie FRED API Key',
    requiredLabel: 'FRED API key',
  },
  finnhub: {
    service: 'Charlie Finnhub API Key',
    requiredLabel: 'Finnhub API key',
  },
}
const GPR_SOURCE_URL = 'https://www.matteoiacoviello.com/gpr.htm'
const GPR_DAILY_DATA_URL = 'https://www.matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls'
const POLYMARKET_GAMMA_URL = 'https://gamma-api.polymarket.com'
const PORTWATCH_SITE_URL = 'https://portwatch.imf.org'
const PORTWATCH_METHODOLOGY_URL = `${PORTWATCH_SITE_URL}/pages/data-and-methodology`
const PORTWATCH_DISRUPTION_MONITOR_URL = `${PORTWATCH_SITE_URL}/pages/disruption-monitor`
const PORTWATCH_SERVICES_URL = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services'
const TRADE_SIGNAL_SOURCE_URL = 'https://finance.yahoo.com'
const TRADE_SIGNAL_TIMESPAN_HOURS = 24 * 7
const TRADE_SIGNAL_NEWS_COUNT = 10
const TRADE_SIGNAL_QUERIES = [
  'port strike',
  'port closure',
  'shipping disruption',
  'cargo delays',
  'canal blockage',
  'rail shutdown',
] as const
const TRADE_SIGNAL_QUERY_LABEL = 'Live headline radar for port strikes, closures, shipping disruptions, cargo delays, canal blockages, and rail shutdowns'

// GDELT DOC 2.0 (free, no API key)
const GDELT_DOC_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'
// GDELT DOC 2.0 caps query length at ~200 raw chars — keep to 7-8 high-signal terms
const GDELT_TRADE_QUERY = '(shipping OR port OR cargo OR container OR logistics OR customs OR canal OR "supply chain" OR freight)'
const GDELT_GEOPOLITICS_QUERY = '(conflict OR warfare OR invasion OR airstrike OR "missile attack" OR "border clash" OR sanctions OR ceasefire OR "civil unrest")'
const GDELT_MAX_HEADLINES = 30
const GDELT_TRADE_MAX_HEADLINES = 80
const DEFAULT_GEOPOLITICS_COUNTRY_SUMMARY_SYSTEM_PROMPT = [
  'You produce concise country-level geopolitical hotspot summaries from supplied event headlines.',
  'Use only the provided country stories and preserve factual grounding with no invented details.',
  'Write in neutral professional language suited to a monitoring terminal.',
  'Avoid generic phrasing. Name the concrete actors, places, and actions that appear in the supplied stories.',
  'Describe what is happening now in that country, not broad background context.',
  'Keep each summary compact, roughly 1 to 3 sentences.',
  'Do not mention event counts, headline counts, severity scores, or numeric risk ratings.',
  'Return strict JSON only.',
].join(' ')

function hoursToGdeltTimespan(hours: number): string {
  if (hours <= 72) return `${hours}h`
  if (hours <= 168) return '1week'
  return '1month'
}

// Maritime RSS feeds (free, no API key)
const GCAPTAIN_RSS_URL = 'https://gcaptain.com/feed/'
const MARITIME_EXEC_RSS_URL = 'https://maritime-executive.com/articles.rss'
const MARITIME_RSS_TIMESPAN_HOURS = 48

// AISstream.io (free with API key via AISSTREAM_API_KEY env var)
const AISSTREAM_WS_URL = 'wss://stream.aisstream.io/v0/stream'
const AIS_LOG_PREFIX = `[vite-ais:${process.pid}]`
const AIS_CHOKEPOINT_ZONES = [
  { id: 'red_sea',   zoneType: 'chokepoint' as const, name: 'Red Sea / Bab el-Mandeb', lat: 12.5, lon: 43.5,  bbox: [[11.0, 43.0], [14.0, 45.0]] },
  { id: 'suez',      zoneType: 'chokepoint' as const, name: 'Suez Canal',               lat: 30.5, lon: 32.3,  bbox: [[29.5, 31.5], [32.5, 33.0]] },
  { id: 'hormuz',    zoneType: 'chokepoint' as const, name: 'Strait of Hormuz',         lat: 26.5, lon: 56.5,  bbox: [[25.0, 55.5], [27.5, 58.0]] },
  { id: 'malacca',   zoneType: 'chokepoint' as const, name: 'Strait of Malacca',        lat: 3.5,  lon: 103.8, bbox: [[1.0, 102.0], [6.0, 105.5]] },
  { id: 'panama',    zoneType: 'chokepoint' as const, name: 'Panama Canal',             lat: 9.2,  lon: -79.5, bbox: [[8.5, -80.5], [10.0, -78.0]] },
  { id: 'cape',      zoneType: 'chokepoint' as const, name: 'Cape of Good Hope',        lat: -34.0, lon: 18.5, bbox: [[-36.0, 17.0], [-32.0, 20.0]] },
  { id: 'gibraltar', zoneType: 'chokepoint' as const, name: 'Strait of Gibraltar',      lat: 36.0, lon: -5.2,  bbox: [[35.5, -6.0], [36.5, -4.5]] },
  { id: 'bosphorus', zoneType: 'chokepoint' as const, name: 'Bosphorus',               lat: 41.1, lon: 29.0,  bbox: [[40.8, 28.5], [41.4, 30.0]] },
]

const AIS_PORT_ZONES = [
  { id: 'port_singapore',   zoneType: 'port' as const, name: 'Singapore',         lat: 1.25,  lon: 103.8,  bbox: [[1.0, 103.5], [1.5, 104.2]] },
  { id: 'port_shanghai',    zoneType: 'port' as const, name: 'Shanghai',           lat: 31.3,  lon: 122.0,  bbox: [[30.5, 121.5], [32.0, 122.8]] },
  { id: 'port_rotterdam',   zoneType: 'port' as const, name: 'Rotterdam',          lat: 51.9,  lon: 4.0,    bbox: [[51.7, 3.7], [52.1, 4.6]] },
  { id: 'port_la',          zoneType: 'port' as const, name: 'LA / Long Beach',    lat: 33.7,  lon: -118.2, bbox: [[33.4, -118.7], [34.0, -117.8]] },
  { id: 'port_dubai',       zoneType: 'port' as const, name: 'Dubai / Jebel Ali',  lat: 24.9,  lon: 55.0,   bbox: [[24.5, 54.5], [25.3, 55.6]] },
  { id: 'port_hongkong',    zoneType: 'port' as const, name: 'Hong Kong',          lat: 22.3,  lon: 114.2,  bbox: [[22.1, 113.8], [22.5, 114.5]] },
  { id: 'port_antwerp',     zoneType: 'port' as const, name: 'Antwerp',            lat: 51.3,  lon: 4.3,    bbox: [[51.1, 3.9], [51.5, 4.7]] },
  { id: 'port_busan',       zoneType: 'port' as const, name: 'Busan',              lat: 35.1,  lon: 129.0,  bbox: [[34.8, 128.5], [35.4, 129.5]] },
  { id: 'port_hamburg',     zoneType: 'port' as const, name: 'Hamburg',            lat: 53.6,  lon: 9.9,    bbox: [[53.3, 9.5], [53.8, 10.3]] },
  { id: 'port_ningbo',      zoneType: 'port' as const, name: 'Ningbo-Zhoushan',   lat: 29.9,  lon: 122.1,  bbox: [[29.5, 121.7], [30.3, 122.5]] },
  { id: 'port_houston',     zoneType: 'port' as const, name: 'Houston',            lat: 29.6,  lon: -94.9,  bbox: [[29.3, -95.4], [30.0, -94.4]] },
  { id: 'port_newyork',     zoneType: 'port' as const, name: 'New York / NJ',      lat: 40.65, lon: -74.1,  bbox: [[40.4, -74.5], [41.0, -73.7]] },
]

const AIS_ALL_ZONES = [...AIS_CHOKEPOINT_ZONES, ...AIS_PORT_ZONES]
const AIS_CONGESTION_BASELINE_MIN_SAMPLES = 6
const AIS_CONGESTION_BASELINE_MIN_WINDOW_MINUTES = 60
const AIS_PORTWATCH_PROXY_LOOKBACK_DAYS = 365
const YAHOO_QUOTE_CACHE_TTL_MS = 5_000
const YAHOO_QUOTE_STALE_TTL_MS = 90_000
const YAHOO_RETRY_ATTEMPTS = 2

const AIS_PORTWATCH_PROXY_CONFIG: Record<string, {
  aliases: string[]
  selection: 'best' | 'sum'
  metricLabel: string
  dataset: 'ports' | 'chokepoints'
}> = {
  red_sea: { aliases: ['bab el mandeb', 'bab al mandab', 'red sea'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  suez: { aliases: ['suez canal', 'suez'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  hormuz: { aliases: ['strait of hormuz', 'hormuz'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  malacca: { aliases: ['strait of malacca', 'malacca'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  panama: { aliases: ['panama canal', 'panama'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  cape: { aliases: ['cape of good hope'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  gibraltar: { aliases: ['strait of gibraltar', 'gibraltar'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  bosphorus: { aliases: ['bosphorus', 'bosporus'], selection: 'best', metricLabel: 'daily transit calls', dataset: 'chokepoints' },
  port_singapore: { aliases: ['singapore'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_shanghai: { aliases: ['shanghai'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_rotterdam: { aliases: ['rotterdam'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_la: { aliases: ['los angeles', 'long beach'], selection: 'sum', metricLabel: 'daily port calls', dataset: 'ports' },
  port_dubai: { aliases: ['jebel ali', 'dubai'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_hongkong: { aliases: ['hong kong'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_antwerp: { aliases: ['antwerp'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_busan: { aliases: ['busan', 'pusan'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_hamburg: { aliases: ['hamburg'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_ningbo: { aliases: ['ningbo', 'zhoushan'], selection: 'sum', metricLabel: 'daily port calls', dataset: 'ports' },
  port_houston: { aliases: ['houston'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
  port_newyork: { aliases: ['new york and new jersey', 'new york new jersey', 'new york / new jersey'], selection: 'best', metricLabel: 'daily port calls', dataset: 'ports' },
}

async function getYF(forceFresh = false) {
  if (!forceFresh && yf) return yf
  const mod = await import('yahoo-finance2')
  // v3 exports a constructor as `default.default` in ESM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: any = (mod as any).default?.default ?? (mod as any).default
  yf = new Ctor({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
  return yf
}

async function resetYF() {
  try {
    const cookieJar = yf?._opts?.cookieJar
    if (cookieJar) {
      await getCrumbClear(cookieJar)
    }
  } catch (error) {
    console.warn('[vite-yf] unable to clear yahoo crumb cache', error)
  } finally {
    yf = null
  }
}

function yahooErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableYahooError(error: unknown): boolean {
  const message = yahooErrorMessage(error).toLowerCase()

  return [
    'crumb',
    'consent',
    'set-cookie',
    'location header',
    'cookie',
    'unauthorized',
    'fetch failed',
    'timed out',
    'timeout',
    'temporary',
    'unexpected redirect',
  ].some((fragment) => message.includes(fragment))
}

function normalizeYahooQuoteResults(batchResult: unknown): unknown[] {
  if (Array.isArray(batchResult)) {
    return batchResult.filter(Boolean)
  }

  if (batchResult && typeof batchResult === 'object') {
    return Object.values(batchResult).filter(Boolean)
  }

  return []
}

async function runYahooRequest<T>(label: string, handler: (finance: any) => Promise<T>): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < YAHOO_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const finance = await getYF(attempt > 0)
      return await handler(finance)
    } catch (error) {
      lastError = error
      const shouldRetry = isRetryableYahooError(error) && attempt < YAHOO_RETRY_ATTEMPTS - 1

      if (!shouldRetry) break

      console.warn(`[vite-yf] ${label} retry ${attempt + 1}/${YAHOO_RETRY_ATTEMPTS - 1}`, error)
      await resetYF()
    }
  }

  if (lastError && isRetryableYahooError(lastError)) {
    await resetYF()
  }

  throw lastError instanceof Error ? lastError : new Error(yahooErrorMessage(lastError))
}

async function fetchYahooQuotes(finance: any, symbols: string[]): Promise<unknown[]> {
  let batchError: unknown = null

  try {
    const batchResult = await finance.quote(symbols)
    const batchQuotes = normalizeYahooQuoteResults(batchResult)
    if (batchQuotes.length) return batchQuotes
  } catch (error) {
    batchError = error
    console.warn('[vite-yf] batch quote fallback', error)
  }

  const singleResults = await Promise.all(
    symbols.map(async (symbol: string) => {
      try {
        return { symbol, quote: await finance.quote(symbol) }
      } catch (error) {
        console.warn(`[vite-yf] single quote failed for ${symbol}`, error)
        return { symbol, error }
      }
    })
  )

  const filtered = singleResults
    .flatMap((entry) => ('quote' in entry && entry.quote ? [entry.quote] : []))

  if (filtered.length) return filtered

  const retryableSingleError = singleResults.find((entry) => 'error' in entry && isRetryableYahooError(entry.error))
  if (retryableSingleError && 'error' in retryableSingleError) {
    throw retryableSingleError.error
  }

  if (batchError) throw batchError

  throw new Error(`Yahoo quote fetch returned no data for ${symbols.join(', ')}`)
}

// Convert a vendor-style range string → { period1, period2 }
// period2 is always set to tomorrow so today's close is always included.
function rangeToPeriods(range: string): { period1: string; period2: string } {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const p2 = tomorrow.toISOString().split('T')[0]
  const p1 = new Date(now)

  switch (range) {
    case '1d':                                         break  // period1 = today → intraday bars for today
    case '5d':   p1.setDate(p1.getDate() - 5);        break
    case '1mo':  p1.setMonth(p1.getMonth() - 1);      break
    case '3mo':  p1.setMonth(p1.getMonth() - 3);      break
    case '6mo':  p1.setMonth(p1.getMonth() - 6);      break
    case '1y':   p1.setFullYear(p1.getFullYear() - 1); break
    case '2y':   p1.setFullYear(p1.getFullYear() - 2); break
    case '5y':   p1.setFullYear(p1.getFullYear() - 5); break
    case '10y':  p1.setFullYear(p1.getFullYear() - 10); break
    case 'max':  p1.setFullYear(1990);                 break
    default:     p1.setFullYear(p1.getFullYear() - 1)
  }

  return { period1: p1.toISOString().split('T')[0], period2: p2 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendJSON(res: any, data: unknown, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
  res.end(body)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendError(res: any, msg: string, status = 500) {
  sendJSON(res, { error: msg }, status)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } catch (error) {
    console.warn(`${label} failed`, error)
    return fallback
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function fetchBinary(url: string): Promise<Buffer> {
  const { default: https } = await import('node:https')

  return new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = https.get(url, { headers: { 'User-Agent': 'Charlie/1.0', Accept: '*/*' } }, (res: any) => {
      const statusCode = res.statusCode ?? 500
      if (statusCode >= 400) {
        reject(new Error(`Request failed (${statusCode}) for ${url}`))
        res.resume()
        return
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })

    req.on('error', reject)
  })
}

function parseCompactUtcDate(value: unknown): string | null {
  const digits = String(value ?? '').trim()
  if (!/^\d{8}$/.test(digits)) return null
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

async function fetchJsonData<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Charlie/1.0',
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : typeof payload?.message === 'string'
        ? payload.message
        : `Request failed (${response.status}) for ${url}`
    throw new Error(message)
  }

  return payload as T
}

function portwatchUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`${PORTWATCH_SERVICES_URL}/${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

function portwatchPageUrl(pageId: string | null | undefined): string {
  return pageId ? `${PORTWATCH_SITE_URL}/pages/${pageId}` : PORTWATCH_DISRUPTION_MONITOR_URL
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function buildSqlInClause(field: string, values: string[]): string {
  if (!values.length) return '1=0'
  return `${field} IN (${values.map((value) => `'${escapeSqlString(value)}'`).join(', ')})`
}

function normalizeDateParts(date: string | null): { year: string; month: string; day: string } | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [year, month, day] = date.split('-')
  return { year, month: String(Number(month)), day: String(Number(day)) }
}

function buildPortwatchTrailingYearWhere(referenceDate = new Date()): string {
  const endYear = referenceDate.getUTCFullYear()
  const endMonth = referenceDate.getUTCMonth() + 1
  const endDay = referenceDate.getUTCDate()
  const cutoffDate = new Date(Date.UTC(endYear, referenceDate.getUTCMonth(), endDay))
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - AIS_PORTWATCH_PROXY_LOOKBACK_DAYS)
  const cutoffYear = cutoffDate.getUTCFullYear()
  const cutoffMonth = cutoffDate.getUTCMonth() + 1
  const cutoffDay = cutoffDate.getUTCDate()

  const lowerBound = [
    `(year > ${cutoffYear})`,
    `(year = ${cutoffYear} AND month > ${cutoffMonth})`,
    `(year = ${cutoffYear} AND month = ${cutoffMonth} AND day >= ${cutoffDay})`,
  ].join(' OR ')
  const upperBound = [
    `(year < ${endYear})`,
    `(year = ${endYear} AND month < ${endMonth})`,
    `(year = ${endYear} AND month = ${endMonth} AND day <= ${endDay})`,
  ].join(' OR ')

  return `((${lowerBound}) AND (${upperBound}))`
}

function normalizePortwatchName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bport of\b/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scorePortwatchAliasMatch(name: string, aliases: string[]): number {
  let best = 0
  for (const alias of aliases) {
    const normalizedAlias = normalizePortwatchName(alias)
    if (!normalizedAlias) continue
    if (name === normalizedAlias) {
      best = Math.max(best, 200 + normalizedAlias.length)
      continue
    }
    if (name.includes(normalizedAlias)) {
      best = Math.max(best, 120 + normalizedAlias.length)
      continue
    }
    if (normalizedAlias.includes(name) && name.length >= 6) {
      best = Math.max(best, 80 + name.length)
    }
  }
  return best
}

function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null
  const plain = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return plain || null
}

function parsePortwatchDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }

  const timestamp = toFiniteNumber(value)
  if (timestamp == null) return null
  return new Date(timestamp).toISOString().slice(0, 10)
}

function parsePortwatchTimestamp(value: unknown): string | null {
  if (value == null || value === '') return null
  const timestamp = toFiniteNumber(value)
  if (timestamp == null) return null
  return new Date(timestamp).toISOString()
}

function clampPositiveInteger(value: string | null, fallback: number, max: number, min = 1): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseYahooSearchPublishedAt(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000
    return new Date(timestamp).toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString()
  }

  if (value && typeof value === 'object') {
    const rawValue = (value as { raw?: unknown }).raw
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      const timestamp = rawValue > 1e12 ? rawValue : rawValue * 1000
      return new Date(timestamp).toISOString()
    }
  }

  return null
}
function normalizeHeadlineText(value: string | null | undefined): string | null {
  const headline = String(value ?? '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return headline || null
}

function canonicalizeUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    url.hash = ''
    url.searchParams.delete('utm_source')
    url.searchParams.delete('utm_medium')
    url.searchParams.delete('utm_campaign')
    url.searchParams.delete('utm_term')
    url.searchParams.delete('utm_content')
    return url.toString()
  } catch {
    return raw
  }
}

function countHeadlineMatches(normalized: string, patterns: RegExp[]): number {
  let total = 0
  for (const pattern of patterns) {
    const matches = normalized.match(pattern)
    if (matches) total += matches.length
  }
  return total
}

type TradeDisruptionHeadlineAssessment = {
  isRelevant: boolean
  score: number
}

function assessTradeDisruptionHeadline(title: string | null | undefined): TradeDisruptionHeadlineAssessment {
  const normalized = String(title ?? '').trim().toLowerCase()
  if (!normalized) return { isRelevant: false, score: 0 }

  const highSignalPatterns = [
    /\bport strike\b/g,
    /\bport closure\b/g,
    /\bport congestion\b/g,
    /\bshipping disruption\b/g,
    /\bsupply chain disruption\b/g,
    /\bcanal blockage\b/g,
    /\bcargo delays?\b/g,
    /\bcustoms delays?\b/g,
    /\bterminal disruption\b/g,
    /\bfactory shutdown\b/g,
    /\bexport halt\b/g,
    /\bimport halt\b/g,
    /\bshipping delays?\b/g,
    /\bcontainer backlog\b/g,
    /\bstopping traffic\b/g,
    /\btraffic stoppage\b/g,
    /\bmerchant shipping\b/g,
  ]
  const tradeSubjectPatterns = [
    /\b(?:port|ports|terminal|terminals|harbor|harbour|shipping|ship|ships|vessel|vessels|cargo|freight|container|containers|logistics|transit|containership|tanker|tankers|bulker|bulkers|carrier|carriers)\b/g,
    /\b(?:supply chain|supplier|suppliers|factory|factories|manufacturing|warehouse|warehousing|customs|export|imports?|procurement)\b/g,
    /\b(?:rail|railway|truck|trucking|bridge|canal|chokepoint|trade route)\b/g,
  ]
  const disruptionPatterns = [
    /\b(?:congestion|closure|closed|shutdown|halted|suspended|blocked|blockage|grounded|grounds|collision|delay|delays|backlog|queue|queued)\b/g,
    /\b(?:shortage|reroute|rerouting|diversion|bottleneck|seized|stoppage|disrupted|disruption|stranded|stall|stalled|snarl|snarled|shock)\b/g,
    /\b(?:strike|strikes|walkout|slowdown|inspection delays?|customs hold|capacity crunch|attack|attacked|hit|hits)\b/g,
  ]
  const chokepointPatterns = [
    /\bsuez\b/g,
    /\bhormuz\b/g,
    /\bpanama\b/g,
    /\bmalacca\b/g,
    /\bgibraltar\b/g,
    /\bbosphorus\b/g,
    /\bred sea\b/g,
    /\bbab el-mandeb\b/g,
  ]
  const genericNoisePatterns = [
    /\b(?:navy|warship|destroyer|frigate|submarine|carrier strike|carrier group|military budget)\b/g,
    /\b(?:intel|warning|warns|proposal|talks|ceasefire|speech|meeting|election|budget)\b/g,
    /\b(?:insurance backstop|oil purchases|energy crisis|crude oil|gas prices?)\b/g,
  ]

  const highSignalHits = countHeadlineMatches(normalized, highSignalPatterns)
  const subjectHits = countHeadlineMatches(normalized, tradeSubjectPatterns)
  const disruptionHits = countHeadlineMatches(normalized, disruptionPatterns)
  const chokepointHits = countHeadlineMatches(normalized, chokepointPatterns)
  const genericNoiseHits = countHeadlineMatches(normalized, genericNoisePatterns)

  const explicitTradeContext = /\b(port|terminal|cargo|container|customs|supply chain|logistics|shipping|freight|canal|trade|transit|tanker|bulker|containership)\b/.test(normalized)
  const genericMarineOnly = /\b(ship|ships|vessel|vessels|carrier|carriers)\b/.test(normalized) && !explicitTradeContext
  const hasTradeContext = (subjectHits > 0 && (!genericMarineOnly || subjectHits > 1 || chokepointHits > 0)) || (chokepointHits > 0 && /\b(ship|shipping|vessel|cargo|container|freight|trade|transit|port|tanker|bulker|carrier)\b/.test(normalized))
  const hasOperationalImpact = highSignalHits > 0 || disruptionHits > 0
  const genericConflictOnly = genericNoiseHits > 0 && highSignalHits === 0 && disruptionHits === 0
  const chokepointButNotTrade = chokepointHits > 0 && !hasTradeContext

  if (!hasTradeContext || !hasOperationalImpact || genericConflictOnly || chokepointButNotTrade) {
    return { isRelevant: false, score: 0 }
  }

  const score = Math.max(
    1,
    Math.min(
      10,
      Math.round((highSignalHits * 4 + Math.min(subjectHits, 4) * 1.2 + Math.min(disruptionHits, 4) * 2.2 + Math.min(chokepointHits, 2) * 0.6 - Math.min(genericNoiseHits, 2) * 1.4) * 10) / 10,
    ),
  )

  return { isRelevant: true, score }
}

function isLikelyTradeLogisticsHeadline(title: string | null | undefined): boolean {
  const normalized = String(title ?? '').trim().toLowerCase()
  if (!normalized) return false

  const exactSignals = [
    'port strike',
    'port closure',
    'shipping disruption',
    'shipping disruptions',
    'canal blockage',
    'cargo delay',
    'cargo delays',
    'rail shutdown',
    'container ships stuck',
    'paralyzes traffic',
  ]
  if (exactSignals.some((fragment) => normalized.includes(fragment))) {
    return true
  }

  const transportTerms = /\b(port|shipping|ship|cargo|freight|rail|railway|bridge|canal|container|logistics|vessel|terminal|harbor|harbour|trade route|traffic|hormuz|suez|panama|red sea|strait|gulf)\b/i
  const disruptionTerms = /\b(strike|struck|stuck|closure|closed|disruption|disruptions|disrupted|blockage|blocked|delay|delays|shutdown|halt|halted|suspend|suspended|collapse|collapsed|collision|rerout|congestion|bottleneck|attack|attacked|drone|missile|paraly|conflict|war|threat)\b/i
  return assessTradeDisruptionHeadline(normalized).isRelevant || (transportTerms.test(normalized) && disruptionTerms.test(normalized))
}

// ─── GDELT types ────────────────────────────────────────────────────────────

type GdeltGeoProperties = {
  name?: string
  count?: number
  articles?: number
  severity?: number
  seendate?: string
  domain?: string
  title?: string
  urllist?: string
}

type GdeltGeoFeature = {
  type?: string
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: GdeltGeoProperties
}

type GdeltGeoResponse = { features?: GdeltGeoFeature[] }

type GdeltDocArticle = {
  url?: string
  title?: string
  seendate?: string
  domain?: string
  sourcecountry?: string
  language?: string
}

type GdeltDocResponse = { articles?: GdeltDocArticle[] }

type GdeltRateLimitError = Error & { gdeltRateLimited: true }

// ─── Maritime RSS types ──────────────────────────────────────────────────────

type RssFeedItem = {
  title: string
  link: string
  pubDate: string | null
  source: string
}

// ─── AIS types ───────────────────────────────────────────────────────────────

type AisVesselSighting = {
  mmsi: string
  status: number
  sog: number
  lat: number
  lon: number
  seenAt: number
}

type AisZoneAccumulator = {
  vessels: Map<string, AisVesselSighting>
}

type AisZoneHistorySample = {
  timestamp: number
  vesselCount: number
  anchoredCount: number
  slowCount: number
  avgSog: number | null
  anchoredRatio: number
  slowRatio: number
}

type AisZoneSnapshot = {
  id: string
  name: string
  zoneType: 'chokepoint' | 'port'
  lat: number
  lon: number
  vesselCount: number
  anchoredCount: number
  slowCount: number
  avgSog: number | null
  congestionScore: number
  congestionBand: 'normal' | 'elevated' | 'high'
  congestionMethod: 'history' | 'warmup' | 'portwatch_12m'
  baselineSampleCount: number
  baselineWindowMinutes: number
  baselineVesselCount: number | null
  baselineAnchoredCount: number | null
  baselineSlowCount: number | null
  baselineAvgSog: number | null
  proxyMetricLabel: string | null
  proxyLatestValue: number | null
  proxyBaselineValue: number | null
  proxyBaselineStdDev: number | null
  proxyAsOf: string | null
  proxySourceLabel: string | null
  sampledAt: string
}

type PortwatchMetricSummaryRow = {
  portid?: string
  portname?: string
  activity_avg?: number | string | null
  activity_stddev?: number | string | null
  sample_count?: number | string | null
}

type AisPortwatchProxyStat = {
  zoneId: string
  sourceAssetIds: string[]
  sourceLabel: string
  metricLabel: string
  latestValue: number | null
  baselineValue: number
  baselineStdDev: number | null
  sampleCount: number
  asOf: string | null
  score: number
  band: 'normal' | 'elevated' | 'high'
}

// ─── GDELT helper functions ──────────────────────────────────────────────────

function parseGdeltSeenDate(value: string | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  const cleaned = value.trim()
  // "20250314T120000Z" or "20250314120000"
  const m1 = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}T${m1[4]}:${m1[5]}:${m1[6]}.000Z`
  const m2 = cleaned.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T${m2[4]}:${m2[5]}:${m2[6]}.000Z`
  const ts = Date.parse(cleaned)
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null
}

// Country centroid lookup for GDELT sourcecountry → lat/lon (maritime-relevant nations)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  'United States': [37.1, -95.7], 'China': [35.9, 104.2], 'India': [20.6, 78.9],
  'United Kingdom': [55.4, -3.4], 'Germany': [51.2, 10.5], 'France': [46.2, 2.2],
  'Japan': [36.2, 138.3], 'South Korea': [35.9, 127.8], 'Brazil': [-14.2, -51.9],
  'Australia': [-25.3, 133.8], 'Canada': [56.1, -106.3], 'Italy': [41.9, 12.6],
  'Spain': [40.5, -3.7], 'Netherlands': [52.1, 5.3], 'Belgium': [50.5, 4.5],
  'Sweden': [60.1, 18.6], 'Norway': [60.5, 8.5], 'Denmark': [56.3, 9.5],
  'Finland': [64.0, 26.0], 'Greece': [39.1, 21.8], 'Turkey': [38.9, 35.2],
  'Russia': [61.5, 105.3], 'Ukraine': [48.4, 31.2], 'Poland': [51.9, 19.1],
  'Singapore': [1.4, 103.8], 'Malaysia': [4.2, 108.0], 'Indonesia': [-0.8, 113.9],
  'Thailand': [15.9, 100.9], 'Vietnam': [14.1, 108.3], 'Philippines': [12.9, 121.8],
  'Taiwan': [23.7, 120.9], 'Hong Kong': [22.3, 114.2], 'Pakistan': [30.4, 69.3],
  'Bangladesh': [23.7, 90.4], 'Sri Lanka': [7.9, 80.8], 'Myanmar': [17.1, 96.0],
  'Saudi Arabia': [24.2, 45.1], 'UAE': [23.4, 53.8], 'Qatar': [25.4, 51.2],
  'Kuwait': [29.3, 47.5], 'Bahrain': [26.0, 50.6], 'Oman': [21.5, 55.9],
  'Iran': [32.4, 53.7], 'Iraq': [33.2, 43.7], 'Israel': [31.0, 34.9],
  'Egypt': [26.8, 30.8], 'Libya': [26.3, 17.2], 'Tunisia': [33.9, 9.5],
  'Morocco': [31.8, -7.1], 'Algeria': [28.0, 1.7], 'Nigeria': [9.1, 8.7],
  'South Africa': [-30.6, 22.9], 'Kenya': [-0.0, 37.9], 'Ethiopia': [9.1, 40.5],
  'Tanzania': [-6.4, 34.9], 'Mozambique': [-18.7, 35.5], 'Djibouti': [11.8, 42.6],
  'Somalia': [6.0, 46.2], 'Yemen': [15.6, 48.5], 'Jordan': [30.6, 36.2],
  'Mexico': [23.6, -102.6], 'Panama': [8.5, -80.8], 'Colombia': [4.6, -74.3],
  'Chile': [-35.7, -71.5], 'Argentina': [-38.4, -63.6], 'Peru': [-9.2, -75.0],
  'Ecuador': [-1.8, -78.2], 'Venezuela': [6.4, -66.6], 'Cuba': [21.5, -79.5],
  'New Zealand': [-40.9, 174.9],
}

const GDELT_COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/suez\s*canal/i, 'Egypt'],
  [/red\s*sea|bab[\s-]el[\s-]mandeb/i, 'Yemen'],
  [/strait\s*of\s*hormuz|hormuz\s*strait|persian\s*gulf/i, 'Oman'],
  [/strait\s*of\s*malacca|malacca\s*strait|singapore\s*strait/i, 'Singapore'],
  [/panama\s*canal/i, 'Panama'],
  [/cape\s*of\s*good\s*hope/i, 'South Africa'],
  [/strait\s*of\s*gibraltar|gibraltar\s*strait/i, 'Spain'],
  [/bosphorus|bosporus/i, 'Turkey'],
  [/taiwan\s*strait/i, 'Taiwan'],
  [/south\s*china\s*sea/i, 'China'],
  [/black\s*sea|odessa|odesa|mariupol/i, 'Ukraine'],
  [/port\s*of\s*rotterdam|rotterdam\s*port/i, 'Netherlands'],
  [/port\s*of\s*shanghai|shanghai\s*port|yangshan/i, 'China'],
  [/port\s*of\s*singapore|singapore\s*port/i, 'Singapore'],
  [/port\s*of\s*dubai|dubai\s*port|jebel\s*ali/i, 'UAE'],
  [/port\s*of\s*hamburg|hamburg\s*port/i, 'Germany'],
  [/port\s*of\s*antwerp|antwerp\s*port/i, 'Belgium'],
  [/port\s*of\s*hong\s*kong|hong\s*kong\s*port/i, 'Hong Kong'],
  [/port\s*of\s*los\s*angeles|los\s*angeles\s*port|long\s*beach\s*port/i, 'United States'],
  [/port\s*of\s*houston|houston\s*port/i, 'United States'],
  [/ningbo|zhoushan/i, 'China'],
  [/port\s*of\s*busan|busan\s*port/i, 'South Korea'],
]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const COUNTRY_TITLE_PATTERNS: Array<[RegExp, string]> = [
  [/\busa\b|\bu\.s\.\b|\bunited\s+states\b/i, 'United States'],
  [/\buk\b|\bu\.k\.\b|\bunited\s+kingdom\b/i, 'United Kingdom'],
  [/\buae\b|\bunited\s+arab\s+emirates\b/i, 'UAE'],
  ...Object.keys(COUNTRY_CENTROIDS)
    .filter((country) => !['United States', 'United Kingdom', 'UAE'].includes(country))
    .sort((a, b) => b.length - a.length)
    .map((country) => [new RegExp(`\\b${escapeRegex(country).replace(/\\ /g, '\\s+')}\\b`, 'i'), country] as [RegExp, string]),
]

const DEMONYM_TITLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bamerican\b/i, 'United States'],
  [/\bbritish\b/i, 'United Kingdom'],
  [/\bemirati\b/i, 'UAE'],
  [/\bqatari\b/i, 'Qatar'],
  [/\bsaudi\b/i, 'Saudi Arabia'],
  [/\bomani\b/i, 'Oman'],
  [/\byemeni\b/i, 'Yemen'],
  [/\begyptian\b/i, 'Egypt'],
  [/\bturkish\b/i, 'Turkey'],
  [/\biranian\b/i, 'Iran'],
  [/\bisraeli\b/i, 'Israel'],
  [/\bukrainian\b/i, 'Ukraine'],
  [/\brussian\b/i, 'Russia'],
  [/\bchinese\b/i, 'China'],
  [/\bjapanese\b/i, 'Japan'],
  [/\bkorean\b/i, 'South Korea'],
  [/\bsingaporean\b/i, 'Singapore'],
  [/\bmalaysian\b/i, 'Malaysia'],
  [/\bindonesian\b/i, 'Indonesia'],
  [/\bthai\b/i, 'Thailand'],
  [/\bvietnamese\b/i, 'Vietnam'],
  [/\bfilipino\b/i, 'Philippines'],
  [/\btaiwanese\b/i, 'Taiwan'],
  [/\bindian\b/i, 'India'],
  [/\bpakistani\b/i, 'Pakistan'],
  [/\bbangladeshi\b/i, 'Bangladesh'],
  [/\bsri\s+lankan\b/i, 'Sri Lanka'],
  [/\baustralian\b/i, 'Australia'],
  [/\bcanadian\b/i, 'Canada'],
  [/\bmexican\b/i, 'Mexico'],
  [/\bpanamanian\b/i, 'Panama'],
  [/\bbrazilian\b/i, 'Brazil'],
  [/\bargentine\b/i, 'Argentina'],
  [/\bchilean\b/i, 'Chile'],
  [/\bperuvian\b/i, 'Peru'],
  [/\bcolombian\b/i, 'Colombia'],
  [/\bvenezuelan\b/i, 'Venezuela'],
  [/\bsouth\s+african\b/i, 'South Africa'],
  [/\bnigerian\b/i, 'Nigeria'],
  [/\bkenyan\b/i, 'Kenya'],
  [/\bdjiboutian\b/i, 'Djibouti'],
]

const COUNTRY_CODE_ALIASES: Record<string, string> = {
  US: 'United States',
  USA: 'United States',
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  GBR: 'United Kingdom',
  AE: 'UAE',
  ARE: 'UAE',
  KR: 'South Korea',
  KOR: 'South Korea',
  CN: 'China',
  CHN: 'China',
  TW: 'Taiwan',
  TWN: 'Taiwan',
  HK: 'Hong Kong',
  HKG: 'Hong Kong',
}

function normalizeGdeltCountryLabel(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const alias = COUNTRY_CODE_ALIASES[raw.toUpperCase()]
  if (alias) return alias
  return COUNTRY_CENTROIDS[raw as keyof typeof COUNTRY_CENTROIDS] ? raw : null
}

function inferCountryFromHeadlineText(title: string | null | undefined): string | null {
  const text = String(title ?? '')
  for (const [pattern, country] of GDELT_COUNTRY_HINTS) {
    if (pattern.test(text)) return country
  }
  for (const [pattern, country] of DEMONYM_TITLE_PATTERNS) {
    if (pattern.test(text)) return country
  }
  for (const [pattern, country] of COUNTRY_TITLE_PATTERNS) {
    if (pattern.test(text)) return country
  }
  return null
}

function inferGdeltCountry(article: GdeltDocArticle): string | null {
  return inferCountryFromHeadlineText(article.title) ?? normalizeGdeltCountryLabel(article.sourcecountry)
}

function scoreGdeltDisruptionSeverity(title: string | null | undefined): number {
  const assessment = assessTradeDisruptionHeadline(title)
  return assessment.isRelevant ? assessment.score : 0
}

function normalizeGdeltClusterSeverity(totalSeverity: number, articleCount: number): number {
  if (!Number.isFinite(totalSeverity) || totalSeverity <= 0 || articleCount <= 0) return 0

  const avgSeverity = totalSeverity / articleCount
  const volumeBoost = Math.min(2, Math.log2(articleCount + 1) * 0.8)
  const normalized = avgSeverity + volumeBoost
  return Math.min(10, Math.max(1, Math.round(normalized * 10) / 10))
}

// Note: GDELT GEO 2.0 endpoint (/api/v2/geo/geo) returns 404. We therefore turn
// DOC headlines into country-level disruption clusters using title heuristics and
// country centroids, then use those clusters for both the map and the summary cards.
function gdeltArticlesToGeoEvents(articles: GdeltDocArticle[]): GdeltGeoFeature[] {
  const locationBuckets = new Map<string, { count: number; severity: number; title: string; url: string; domain: string; seendate: string; lat: number; lon: number }>()
  for (const article of articles) {
    const severity = scoreGdeltDisruptionSeverity(article.title)
    if (severity <= 0) continue
    const country = inferGdeltCountry(article)
    if (!country) continue
    const coords = COUNTRY_CENTROIDS[country as keyof typeof COUNTRY_CENTROIDS]
    if (!coords) continue

    const key = country
    const existing = locationBuckets.get(key)
    if (existing) {
      existing.count += 1
      existing.severity += severity
      const currentSeenAt = parseGdeltSeenDate(article.seendate) ?? ''
      const existingSeenAt = parseGdeltSeenDate(existing.seendate) ?? ''
      if (currentSeenAt >= existingSeenAt) {
        existing.title = article.title ?? key
        existing.url = article.url ?? ''
        existing.domain = article.domain ?? ''
        existing.seendate = article.seendate ?? ''
      }
    } else {
      locationBuckets.set(key, {
        count: 1,
        severity,
        title: article.title ?? key,
        url: article.url ?? '',
        domain: article.domain ?? '',
        seendate: article.seendate ?? '',
        lat: coords[0],
        lon: coords[1],
      })
    }
  }

  const features: GdeltGeoFeature[] = []
  for (const [locName, data] of locationBuckets) {
    const clusterSeverity = normalizeGdeltClusterSeverity(data.severity, data.count)
    features.push({
      geometry: { coordinates: [data.lon, data.lat] },
      properties: {
        name: locName,
        count: data.count,
        articles: data.count,
        severity: clusterSeverity,
        title: data.title,
        urllist: data.url,
        domain: data.domain,
        seendate: data.seendate,
      },
    })
  }
  console.log(`[vite-gdelt-geo] Geo features built: ${features.length} from ${locationBuckets.size} locations`)
  return features
}

function liveTradeHeadlinesToGeoEvents(headlines: Array<{ title?: string | null; url?: string | null; publisher?: string | null; seenAt?: string | null }>): GdeltGeoFeature[] {
  const locationBuckets = new Map<string, { count: number; severity: number; title: string; url: string; domain: string; seendate: string; lat: number; lon: number }>()
  for (const headline of headlines) {
    const title = normalizeHeadlineText(headline.title)
    if (!title) continue
    const severity = scoreGdeltDisruptionSeverity(title)
    if (severity <= 0) continue
    const country = inferCountryFromHeadlineText(title)
    if (!country) continue
    const coords = COUNTRY_CENTROIDS[country as keyof typeof COUNTRY_CENTROIDS]
    if (!coords) continue

    const existing = locationBuckets.get(country)
    if (existing) {
      existing.count += 1
      existing.severity += severity
      const currentSeenAt = headline.seenAt ?? ''
      if (currentSeenAt >= existing.seendate) {
        existing.title = title
        existing.url = headline.url ?? ''
        existing.domain = headline.publisher ?? ''
        existing.seendate = headline.seenAt ?? ''
      }
    } else {
      locationBuckets.set(country, {
        count: 1,
        severity,
        title,
        url: headline.url ?? '',
        domain: headline.publisher ?? '',
        seendate: headline.seenAt ?? '',
        lat: coords[0],
        lon: coords[1],
      })
    }
  }

  const features: GdeltGeoFeature[] = []
  for (const [locName, data] of locationBuckets) {
    features.push({
      geometry: { coordinates: [data.lon, data.lat] },
      properties: {
        name: locName,
        count: data.count,
        articles: data.count,
        severity: normalizeGdeltClusterSeverity(data.severity, data.count),
        title: data.title,
        urllist: data.url,
        domain: data.domain,
        seendate: data.seendate,
      },
    })
  }
  console.log(`[vite-gdelt-geo] Live-headline fallback built: ${features.length} countries from ${headlines.length} headlines`)
  return features
}

async function fetchGdeltHeadlines(query: string, timespan: string, maxRecords = 25): Promise<GdeltDocArticle[]> {
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    timespan,
    maxrecords: String(maxRecords),
    sort: 'DateDesc',
    format: 'json',
  })
  const url = `${GDELT_DOC_URL}?${params}`
  const makeRateLimitError = (message: string): GdeltRateLimitError => {
    const err = new Error(message) as GdeltRateLimitError
    err.gdeltRateLimited = true
    return err
  }
  const isRateLimitError = (error: unknown): error is GdeltRateLimitError =>
    Boolean(error && typeof error === 'object' && (error as { gdeltRateLimited?: boolean }).gdeltRateLimited)

  // GDELT can be slow to establish TLS from some networks; Node fetch often
  // times out at connect-time before our AbortSignal kicks in. Try fetch first,
  // then fall back to node:https with a longer socket timeout.
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Charlie/1.0' },
      signal: AbortSignal.timeout(GDELT_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[vite-gdelt-doc] HTTP ${res.status}: ${body.slice(0, 200)}`)
      if (res.status === 429) {
        throw makeRateLimitError('GDELT rate-limited request (HTTP 429)')
      }
      return []
    }
    const data = (await res.json()) as GdeltDocResponse
    const articles = Array.isArray(data.articles) ? data.articles : []
    console.log(`[vite-gdelt-doc] Fetched ${articles.length} articles via fetch`)
    return articles
  } catch (err) {
    if (isRateLimitError(err)) {
      throw err
    }
    console.warn('[vite-gdelt-doc] fetch path failed, retrying via node:https:', err)
  }

  try {
    const { default: https } = await import('node:https')
    const body = await new Promise<string>((resolve, reject) => {
      const req = https.get(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Charlie/1.0' },
      }, (res) => {
        const statusCode = res.statusCode ?? 0
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            if (statusCode === 429) {
              reject(makeRateLimitError('GDELT rate-limited request (HTTP 429)'))
              return
            }
            reject(new Error(`HTTP ${statusCode}: ${raw.slice(0, 200)}`))
            return
          }
          resolve(raw)
        })
      })
      req.setTimeout(GDELT_HTTPS_TIMEOUT_MS, () => req.destroy(new Error('GDELT https timeout')))
      req.on('error', reject)
    })

    const data = JSON.parse(body) as GdeltDocResponse
    const articles = Array.isArray(data.articles) ? data.articles : []
    console.log(`[vite-gdelt-doc] Fetched ${articles.length} articles via node:https fallback`)
    return articles
  } catch (err) {
    if (isRateLimitError(err)) {
      throw err
    }
    console.warn('[vite-gdelt-doc] https fallback failed:', err)
    return []
  }
}

// ─── Maritime RSS helper functions ────────────────────────────────────────────

function parseRssItems(xml: string, sourceName: string): RssFeedItem[] {
  const stripCdata = (value: string | undefined): string | null => {
    const cleaned = value
      ?.replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .trim()
    return normalizeHeadlineText(cleaned)
  }

  const items: RssFeedItem[] = []
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)
  for (const match of itemMatches) {
    const block = match[1]
    const titleRaw = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]
    const linkRaw = block.match(/<link>([^<]+)<\/link>/)?.[1]?.trim()
      ?? block.match(/<link[^>]+href="([^"]+)"/)?.[1]
    const pubDateRaw = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim()

    const title = stripCdata(titleRaw)
    const link = canonicalizeUrl(linkRaw)
    if (!title || !link) continue

    const pubTs = pubDateRaw ? Date.parse(pubDateRaw) : null
    items.push({
      title,
      link,
      pubDate: pubTs && Number.isFinite(pubTs) ? new Date(pubTs).toISOString() : null,
      source: sourceName,
    })
  }

  if (items.length > 0) return items

  const entryMatches = xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)
  for (const match of entryMatches) {
    const block = match[1]
    const titleRaw = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    const linkRaw =
      block.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i)?.[1]
      ?? block.match(/<link[^>]+href="([^"]+)"/i)?.[1]
    const updatedRaw =
      block.match(/<updated>([^<]+)<\/updated>/i)?.[1]?.trim()
      ?? block.match(/<published>([^<]+)<\/published>/i)?.[1]?.trim()

    const title = stripCdata(titleRaw)
    const link = canonicalizeUrl(linkRaw)
    if (!title || !link) continue

    const updatedTs = updatedRaw ? Date.parse(updatedRaw) : null
    items.push({
      title,
      link,
      pubDate: updatedTs && Number.isFinite(updatedTs) ? new Date(updatedTs).toISOString() : null,
      source: sourceName,
    })
  }

  return items
}

async function fetchRssFeed(url: string, sourceName: string): Promise<RssFeedItem[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': 'Charlie/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    return parseRssItems(await res.text(), sourceName)
  } catch {
    return []
  }
}

// ─── GDELT module-level cache (shared across all limit variants, rate-limited) ─
// GDELT DOC 2.0 allows 1 request per 5 seconds. Cache is keyed by query-scope + timespan
// so different `limit` values reuse the same GDELT result without cross-query contamination.
const _gdeltCache = new Map<string, { expiresAt: number; articles: GdeltDocArticle[] }>()
const _gdeltPending = new Map<string, Promise<GdeltDocArticle[]>>()
const _gdeltLastNonEmptyByCacheKey = new Map<string, GdeltDocArticle[]>()
const _gdeltLastNonEmptyByQueryKey = new Map<string, GdeltDocArticle[]>()
let _gdeltLastRequestAt = 0
let _gdeltBlockedUntil = 0
const GDELT_MIN_INTERVAL_MS = 6_000 // 6 s between requests (safely under GDELT's 1/5 s limit)
const GDELT_RATE_LIMIT_COOLDOWN_MS = 60_000
const GDELT_FETCH_TIMEOUT_MS = 12_000
const GDELT_HTTPS_TIMEOUT_MS = 12_000
const GDELT_ENDPOINT_BUDGET_MS = 8_000
const TRADE_SIGNAL_BUDGET_MS = 6_000
const PORTWATCH_ENDPOINT_BUDGET_MS = 8_000

function gdeltCacheKey(queryKey: string, timespan: string): string {
  return `${queryKey}:${timespan}`
}

async function getCachedGdeltArticles(
  queryKey: string,
  query: string,
  timespan: string,
  maxRecords: number,
): Promise<GdeltDocArticle[]> {
  const cacheKey = gdeltCacheKey(queryKey, timespan)
  const cached = _gdeltCache.get(cacheKey)
  const now = Date.now()
  const staleByScope = cached?.articles ?? _gdeltLastNonEmptyByCacheKey.get(cacheKey) ?? []
  const staleByQuery = _gdeltLastNonEmptyByQueryKey.get(queryKey) ?? []
  // Serve fresh cache immediately
  if (cached && cached.expiresAt > now) return cached.articles

  if (now < _gdeltBlockedUntil) {
    const remainingMs = _gdeltBlockedUntil - now
    console.warn(`[vite-gdelt] In rate-limit cooldown for ${Math.ceil(remainingMs / 1000)}s; serving stale cache for ${queryKey}:${timespan}`)
    return staleByScope.length > 0 ? staleByScope : staleByQuery
  }

  // Deduplicate concurrent requests for the same query+timespan scope
  const inflight = _gdeltPending.get(cacheKey)
  if (inflight) return inflight

  // Rate-limit: if we're inside cooldown, prefer stale data. If there is no stale
  // data at all, wait out cooldown once instead of returning deterministic empty.
  const msUntilAllowed = GDELT_MIN_INTERVAL_MS - (now - _gdeltLastRequestAt)
  const shouldWaitForQuota = msUntilAllowed > 0 && staleByScope.length === 0 && staleByQuery.length === 0
  if (msUntilAllowed > 0) {
    if (staleByScope.length > 0) {
      console.log(`[vite-gdelt] Rate-limited (${Math.ceil(msUntilAllowed / 1000)}s), serving stale cache for ${queryKey}:${timespan}`)
      return staleByScope
    }
    if (staleByQuery.length > 0) {
      console.log(`[vite-gdelt] Rate-limited (${Math.ceil(msUntilAllowed / 1000)}s), serving cross-timespan stale cache for ${queryKey}:${timespan}`)
      return staleByQuery
    }
    console.log(`[vite-gdelt] Waiting ${Math.ceil(msUntilAllowed / 1000)}s to respect GDELT quota for ${queryKey}:${timespan}`)
  }

  // Fire a background fetch — mark as in-flight so concurrent calls reuse it
  const promise = (async () => {
    try {
      if (shouldWaitForQuota) {
        await new Promise((resolve) => setTimeout(resolve, msUntilAllowed))
      }

      let articles: GdeltDocArticle[] = []
      const isRateLimitError = (error: unknown): error is GdeltRateLimitError =>
        Boolean(error && typeof error === 'object' && (error as { gdeltRateLimited?: boolean }).gdeltRateLimited)

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
          const retryDelayMs = 1_200 + attempt * 1_200
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        }
        _gdeltLastRequestAt = Date.now()
        try {
          articles = await fetchGdeltHeadlines(query, timespan, maxRecords)
        } catch (err) {
          if (isRateLimitError(err)) {
            _gdeltBlockedUntil = Date.now() + GDELT_RATE_LIMIT_COOLDOWN_MS
            console.warn(`[vite-gdelt] Rate-limited by GDELT; pausing upstream calls for ${Math.ceil(GDELT_RATE_LIMIT_COOLDOWN_MS / 1000)}s`)
            break
          }
          console.warn('[vite-gdelt-doc]', err)
          continue
        }
        if (articles.length > 0) break
      }

      if (articles.length > 0) {
        _gdeltLastNonEmptyByCacheKey.set(cacheKey, articles)
        _gdeltLastNonEmptyByQueryKey.set(queryKey, articles)
        _gdeltCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, articles })
        return articles
      }

      const fallbackArticles = staleByScope.length > 0 ? staleByScope : staleByQuery
      if (fallbackArticles.length > 0) {
        console.log(`[vite-gdelt] Fresh fetch empty for ${queryKey}:${timespan}, serving last-known-good (${fallbackArticles.length})`)
        _gdeltCache.set(cacheKey, { expiresAt: Date.now() + 90_000, articles: fallbackArticles })
        return fallbackArticles
      }

      // If we still have nothing, keep empty cache very short so we retry soon.
      _gdeltCache.set(cacheKey, { expiresAt: Date.now() + 20_000, articles: [] })
      return []
    } finally {
      _gdeltPending.delete(cacheKey)
    }
  })()

  _gdeltPending.set(cacheKey, promise)
  return promise
}

// ─── AIS chokepoint monitor (module-level state) ──────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _aisWs: any = null
let _aisReconnectTimer: ReturnType<typeof setTimeout> | null = null
let _aisConsecutiveFailures = 0
let _aisApiKey = ''
const _aisZoneData = new Map<string, AisZoneAccumulator>()
const _aisZoneHistory = new Map<string, AisZoneHistorySample[]>()
let _aisCachedSnapshot: AisZoneSnapshot[] = []
let _aisSnapshotAt = 0
let _aisEnabled = false
let _aisShouldReconnect = false

function _getAisZoneForPosition(lat: number, lon: number): string | null {
  for (const zone of AIS_ALL_ZONES) {
    const [[latMin, lonMin], [latMax, lonMax]] = zone.bbox as [[number, number], [number, number]]
    if (lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax) return zone.id
  }
  return null
}

function _clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function _mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function _stdDev(values: number[], mean: number | null): number {
  if (values.length < 2 || mean == null) return 0
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(Math.max(variance, 0))
}

function _positiveDeviation(current: number | null, baseline: number | null, spread: number, floor = 1): number {
  if (current == null || baseline == null) return 0
  const divisor = Math.max(spread, floor)
  return Math.max(0, (current - baseline) / divisor)
}

function _scorePortwatchProxy(latestValue: number | null, baselineValue: number | null, baselineStdDev: number | null): {
  score: number
  band: 'normal' | 'elevated' | 'high'
} {
  if (latestValue == null || baselineValue == null || baselineValue <= 0) {
    return { score: 0, band: 'normal' }
  }

  const ratio = latestValue / baselineValue
  const deviation = _positiveDeviation(latestValue, baselineValue, Math.max(baselineStdDev ?? 0, baselineValue * 0.12), Math.max(4, baselineValue * 0.12))
  const pressure = deviation * 0.75 + Math.max(0, ratio - 1) * 2.2
  const score = Math.min(100, Math.max(0, Math.round(pressure * 22)))
  const band = score >= 65 ? 'high' : score >= 35 ? 'elevated' : 'normal'
  return { score, band }
}

function _buildAisPortwatchProxyStats(
  zones: Array<{ id: string; zoneType: 'chokepoint' | 'port' }>,
  portHistoryRows: PortwatchMetricSummaryRow[],
  chokepointHistoryRows: PortwatchMetricSummaryRow[],
  latestPortRows: PortwatchPortActivityRow[],
  latestChokepointRows: PortwatchChokepointActivityRow[],
  latestPortDate: string | null,
  latestChokepointDate: string | null,
): Map<string, AisPortwatchProxyStat> {
  const buildCandidates = (
    historyRows: PortwatchMetricSummaryRow[],
    latestRows: Array<PortwatchPortActivityRow | PortwatchChokepointActivityRow>,
    latestValueKey: 'portcalls' | 'n_total',
  ) => {
    const historyById = new Map<string, PortwatchMetricSummaryRow>()
    const latestById = new Map<string, PortwatchPortActivityRow | PortwatchChokepointActivityRow>()

    for (const row of historyRows) {
      const portId = typeof row.portid === 'string' ? row.portid.trim() : ''
      if (!portId) continue
      historyById.set(portId, row)
    }
    for (const row of latestRows) {
      const portId = typeof row.portid === 'string' ? row.portid.trim() : ''
      if (!portId) continue
      latestById.set(portId, row)
    }

    const candidateIds = Array.from(new Set([...historyById.keys(), ...latestById.keys()]))
    return candidateIds.map((portId) => {
      const history = historyById.get(portId)
      const latest = latestById.get(portId)
      const portName = typeof latest?.portname === 'string' && latest.portname.trim()
        ? latest.portname.trim()
        : typeof history?.portname === 'string' && history.portname.trim()
          ? history.portname.trim()
          : portId
      const latestValue = latestValueKey === 'portcalls'
        ? toFiniteNumber((latest as PortwatchPortActivityRow | undefined)?.portcalls)
        : toFiniteNumber((latest as PortwatchChokepointActivityRow | undefined)?.n_total)
      return {
        portId,
        portName,
        normalizedName: normalizePortwatchName(portName),
        latestValue,
        baselineValue: toFiniteNumber(history?.activity_avg),
        baselineStdDev: toFiniteNumber(history?.activity_stddev),
        sampleCount: Math.round(toFiniteNumber(history?.sample_count) ?? 0),
      }
    })
  }

  const portCandidates = buildCandidates(portHistoryRows, latestPortRows, 'portcalls')
  const chokepointCandidates = buildCandidates(chokepointHistoryRows, latestChokepointRows, 'n_total')
  const proxyStats = new Map<string, AisPortwatchProxyStat>()

  for (const zone of zones) {
    const config = AIS_PORTWATCH_PROXY_CONFIG[zone.id]
    if (!config) continue
    const candidates = (config.dataset === 'ports' ? portCandidates : chokepointCandidates)
      .map((candidate) => ({
        ...candidate,
        matchScore: scorePortwatchAliasMatch(candidate.normalizedName, config.aliases),
      }))
      .filter((candidate) => candidate.matchScore > 0 && candidate.baselineValue != null && candidate.baselineValue > 0)

    if (candidates.length === 0) continue

    const selected = config.selection === 'sum'
      ? candidates
      : [candidates.sort((left, right) =>
        right.matchScore - left.matchScore ||
        (right.latestValue ?? 0) - (left.latestValue ?? 0) ||
        (right.baselineValue ?? 0) - (left.baselineValue ?? 0)
      )[0]]

    const baselineValue = selected.reduce((sum, candidate) => sum + (candidate.baselineValue ?? 0), 0)
    if (baselineValue <= 0) continue
    const latestValues = selected.map((candidate) => candidate.latestValue).filter((value): value is number => value != null)
    const latestValue = latestValues.length > 0 ? latestValues.reduce((sum, value) => sum + value, 0) : null
    const baselineStdDev = Math.sqrt(selected.reduce((sum, candidate) => sum + ((candidate.baselineStdDev ?? 0) ** 2), 0)) || null
    const sampleCount = Math.min(...selected.map((candidate) => Math.max(candidate.sampleCount, 0)).filter((value) => value > 0))
    const score = _scorePortwatchProxy(latestValue, baselineValue, baselineStdDev)

    proxyStats.set(zone.id, {
      zoneId: zone.id,
      sourceAssetIds: selected.map((candidate) => candidate.portId),
      sourceLabel: selected.map((candidate) => candidate.portName).join(' + '),
      metricLabel: config.metricLabel,
      latestValue,
      baselineValue,
      baselineStdDev,
      sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0,
      asOf: config.dataset === 'ports' ? latestPortDate : latestChokepointDate,
      score: score.score,
      band: score.band,
    })
  }

  return proxyStats
}

function _applyAisPortwatchProxyBaselines(
  zones: AisZoneSnapshot[],
  proxyStats: Map<string, AisPortwatchProxyStat>,
): AisZoneSnapshot[] {
  return zones.map((zone) => {
    const proxy = proxyStats.get(zone.id)
    if (!proxy) return zone
    return {
      ...zone,
      congestionScore: proxy.score,
      congestionBand: proxy.band,
      congestionMethod: 'portwatch_12m',
      baselineSampleCount: proxy.sampleCount,
      baselineWindowMinutes: 0,
      baselineVesselCount: null,
      baselineAnchoredCount: null,
      baselineSlowCount: null,
      baselineAvgSog: null,
      proxyMetricLabel: proxy.metricLabel,
      proxyLatestValue: proxy.latestValue != null ? Math.round(proxy.latestValue) : null,
      proxyBaselineValue: Math.round(proxy.baselineValue),
      proxyBaselineStdDev: proxy.baselineStdDev != null ? Math.round(proxy.baselineStdDev * 10) / 10 : null,
      proxyAsOf: proxy.asOf,
      proxySourceLabel: proxy.sourceLabel,
    }
  })
}

function _scoreAisCongestion(current: {
  vesselCount: number
  anchoredCount: number
  slowCount: number
  avgSog: number | null
}, history: AisZoneHistorySample[]): {
  score: number
  band: 'normal' | 'elevated' | 'high'
  method: 'history' | 'warmup'
  baselineSampleCount: number
  baselineWindowMinutes: number
  baselineVesselCount: number | null
  baselineAnchoredCount: number | null
  baselineSlowCount: number | null
  baselineAvgSog: number | null
} {
  const baselineSampleCount = history.length
  if (baselineSampleCount === 0) {
    return {
      score: 0,
      band: 'normal',
      method: 'warmup',
      baselineSampleCount: 0,
      baselineWindowMinutes: 0,
      baselineVesselCount: null,
      baselineAnchoredCount: null,
      baselineSlowCount: null,
      baselineAvgSog: null,
    }
  }

  const vesselCounts = history.map((sample) => sample.vesselCount)
  const anchoredRatios = history.map((sample) => sample.anchoredRatio)
  const slowRatios = history.map((sample) => sample.slowRatio)
  const avgSogs = history.map((sample) => sample.avgSog).filter((value): value is number => value != null)

  const baselineVesselCount = _mean(vesselCounts)
  const baselineAnchoredCount = _mean(history.map((sample) => sample.anchoredCount))
  const baselineSlowCount = _mean(history.map((sample) => sample.slowCount))
  const baselineAvgSog = _mean(avgSogs)

  const sparseFactor = baselineSampleCount < 6 ? 1.25 + (6 - baselineSampleCount) * 0.15 : 1
  const densityZ = _positiveDeviation(current.vesselCount, baselineVesselCount, _stdDev(vesselCounts, baselineVesselCount), 1.5 * sparseFactor)
  const anchoredRate = current.vesselCount > 0 ? current.anchoredCount / current.vesselCount : 0
  const slowRate = Math.max(current.vesselCount - current.anchoredCount, 0) > 0
    ? current.slowCount / Math.max(current.vesselCount - current.anchoredCount, 1)
    : 0
  const baselineAnchoredRate = _mean(anchoredRatios)
  const baselineSlowRate = _mean(slowRatios)
  const anchoredZ = _positiveDeviation(anchoredRate, baselineAnchoredRate, _stdDev(anchoredRatios, baselineAnchoredRate), 0.08 * sparseFactor)
  const slowZ = _positiveDeviation(slowRate, baselineSlowRate, _stdDev(slowRatios, baselineSlowRate), 0.08 * sparseFactor)
  const speedZ = _positiveDeviation(baselineAvgSog, current.avgSog, _stdDev(avgSogs, baselineAvgSog), 0.5 * sparseFactor)

  const pressure =
    densityZ * 0.42 +
    anchoredZ * 0.26 +
    slowZ * 0.22 +
    speedZ * 0.10

  const score = Math.min(100, Math.max(0, Math.round(pressure * 25)))
  const band = score >= 65 ? 'high' : score >= 35 ? 'elevated' : 'normal'
  const windowMinutes = baselineSampleCount > 1
    ? Math.max(1, Math.round((history[baselineSampleCount - 1].timestamp - history[0].timestamp) / 60_000))
    : baselineSampleCount
  const hasMatureBaseline =
    baselineSampleCount >= AIS_CONGESTION_BASELINE_MIN_SAMPLES &&
    windowMinutes >= AIS_CONGESTION_BASELINE_MIN_WINDOW_MINUTES

  return {
    score,
    band,
    method: hasMatureBaseline ? 'history' : 'warmup',
    baselineSampleCount,
    baselineWindowMinutes: windowMinutes,
    baselineVesselCount: hasMatureBaseline ? baselineVesselCount : null,
    baselineAnchoredCount: hasMatureBaseline ? baselineAnchoredCount : null,
    baselineSlowCount: hasMatureBaseline ? baselineSlowCount : null,
    baselineAvgSog: hasMatureBaseline && baselineAvgSog != null ? Math.round(baselineAvgSog * 10) / 10 : null,
  }
}

function _buildAisAggregate(): AisZoneSnapshot[] {
  const now = Date.now()
  const cutoff = now - 10 * 60_000
  const snapshots: AisZoneSnapshot[] = AIS_ALL_ZONES.map((zone) => {
    const acc = _aisZoneData.get(zone.id)
    const vessels = acc
      ? Array.from(acc.vessels.values()).filter((v) => v.seenAt >= cutoff)
      : []
    const anchoredCount = vessels.filter((v) => v.status === 1 || v.status === 5).length
    const movingVessels = vessels.filter((v) => v.status !== 1 && v.status !== 5)
    const slowCount = movingVessels.filter((v) => v.sog < 3).length
    const avgSog = movingVessels.length > 0
      ? movingVessels.reduce((sum, v) => sum + v.sog, 0) / movingVessels.length
      : null
    const vesselCount = vessels.length
    return {
      id: zone.id,
      name: zone.name,
      zoneType: zone.zoneType,
      lat: zone.lat,
      lon: zone.lon,
      vesselCount,
      anchoredCount,
      slowCount,
      avgSog: avgSog != null ? Math.round(avgSog * 10) / 10 : null,
      sampledAt: new Date(now).toISOString(),
      congestionScore: 0,
      congestionBand: 'normal',
      congestionMethod: 'warmup',
      baselineSampleCount: 0,
      baselineWindowMinutes: 0,
      baselineVesselCount: null,
      baselineAnchoredCount: null,
      baselineSlowCount: null,
      baselineAvgSog: null,
      proxyMetricLabel: null,
      proxyLatestValue: null,
      proxyBaselineValue: null,
      proxyBaselineStdDev: null,
      proxyAsOf: null,
      proxySourceLabel: null,
    }
  })

  const nextHistory = new Map<string, AisZoneHistorySample[]>()
  for (const snapshot of snapshots) {
    const history = _aisZoneHistory.get(snapshot.id) ?? []
    const scored = _scoreAisCongestion(snapshot, history)
    const sample: AisZoneHistorySample = {
      timestamp: now,
      vesselCount: snapshot.vesselCount,
      anchoredCount: snapshot.anchoredCount,
      slowCount: snapshot.slowCount,
      avgSog: snapshot.avgSog,
      anchoredRatio: snapshot.vesselCount > 0 ? snapshot.anchoredCount / snapshot.vesselCount : 0,
      slowRatio: Math.max(snapshot.vesselCount - snapshot.anchoredCount, 0) > 0
        ? snapshot.slowCount / Math.max(snapshot.vesselCount - snapshot.anchoredCount, 1)
        : 0,
    }
    const nextSamples = [...history, sample].slice(-120)
    nextHistory.set(snapshot.id, nextSamples)

    snapshot.congestionScore = scored.score
    snapshot.congestionBand = scored.band
    snapshot.congestionMethod = scored.method
    snapshot.baselineSampleCount = scored.baselineSampleCount
    snapshot.baselineWindowMinutes = scored.baselineWindowMinutes
    snapshot.baselineVesselCount = scored.baselineVesselCount
    snapshot.baselineAnchoredCount = scored.baselineAnchoredCount
    snapshot.baselineSlowCount = scored.baselineSlowCount
    snapshot.baselineAvgSog = scored.baselineAvgSog
  }

  for (const [zoneId, samples] of nextHistory) {
    _aisZoneHistory.set(zoneId, samples)
  }

  return snapshots
}

function _stopAisStream(reason = 'shutdown'): void {
  _aisShouldReconnect = false
  if (_aisReconnectTimer) {
    clearTimeout(_aisReconnectTimer)
    _aisReconnectTimer = null
  }
  const ws = _aisWs
  _aisWs = null
  if (!ws) return
  try {
    ws.close(1000, reason.slice(0, 120))
  } catch {}
}

function _ensureAisStream(apiKey: string, source: string): void {
  if (!apiKey) return
  _aisApiKey = apiKey
  _aisEnabled = true
  _aisShouldReconnect = true
  if (_aisWs || _aisReconnectTimer) return
  console.log(`${AIS_LOG_PREFIX} Starting AIS stream from ${source}`)
  _connectAisStream(apiKey)
}

function _connectAisStream(apiKey: string): void {
  if (!_aisShouldReconnect) return
  _aisApiKey = apiKey
  if (_aisWs) { try { _aisWs.close() } catch {} ; _aisWs = null }

  try {
    const ws = new NodeWS(AISSTREAM_WS_URL) as any
    _aisWs = ws

    ws.on('open', () => {
      console.log(`${AIS_LOG_PREFIX} Connected to AISstream.io, subscribing to all zones...`)
      const boundingBoxes = AIS_ALL_ZONES.map((z) => z.bbox.map((pair) => [pair[0], pair[1]]))
      const subMsg = JSON.stringify({ APIKey: apiKey, BoundingBoxes: boundingBoxes, FilterMessageTypes: ['PositionReport'] })
      ws.send(subMsg)
      console.log(`${AIS_LOG_PREFIX} Subscribed to ${AIS_ALL_ZONES.length} zones (${AIS_CHOKEPOINT_ZONES.length} chokepoints + ${AIS_PORT_ZONES.length} ports)`)
    })

    ws.on('message', (data: Buffer | string) => {
      try {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = JSON.parse(raw) as any
        if (typeof msg?.error === 'string' && msg.error.trim()) {
          _aisConsecutiveFailures = 0
          console.warn(`${AIS_LOG_PREFIX} Server error: ${msg.error}`)
          return
        }
        if (msg?.MessageType !== 'PositionReport') return
        _aisConsecutiveFailures = 0 // successful message resets backoff
        const report = msg?.Message?.PositionReport
        const meta = msg?.MetaData ?? msg?.Metadata
        if (!report || !meta) return

        const lat = typeof report.Latitude === 'number' ? report.Latitude : toFiniteNumber(meta.latitude)
        const lon = typeof report.Longitude === 'number' ? report.Longitude : toFiniteNumber(meta.longitude)
        if (lat == null || lon == null) return
        const mmsi = String(meta.MMSI ?? report.UserID ?? '').trim()
        if (!mmsi) return

        const zoneId = _getAisZoneForPosition(lat, lon)
        if (!zoneId) return
        if (!_aisZoneData.has(zoneId)) {
          _aisZoneData.set(zoneId, { vessels: new Map() })
          const zoneName = AIS_ALL_ZONES.find(z => z.id === zoneId)?.name ?? zoneId
          console.log(`${AIS_LOG_PREFIX} First vessel in ${zoneName}: MMSI=${mmsi} SOG=${report.Sog}`)
        }
        _aisZoneData.get(zoneId)!.vessels.set(mmsi, {
          mmsi,
          status: typeof report.NavigationalStatus === 'number' ? report.NavigationalStatus : 15,
          sog: typeof report.Sog === 'number' ? report.Sog : 0,
          lat, lon,
          seenAt: Date.now(),
        })

        if (Date.now() - _aisSnapshotAt > 30_000) {
          _aisCachedSnapshot = _buildAisAggregate()
          _aisSnapshotAt = Date.now()
          const total = _aisCachedSnapshot.reduce((s: number, z: any) => s + z.vesselCount, 0)
          console.log(`${AIS_LOG_PREFIX} Snapshot: ${total} vessels across ${_aisCachedSnapshot.length} zones`)
        }
      } catch {}
    })

    ws.on('close', (code: number, reason: Buffer) => {
      if (!_aisShouldReconnect) {
        console.log(`${AIS_LOG_PREFIX} Closed intentionally (code=${code} reason=${reason?.toString() ?? ''})`)
        return
      }
      _aisConsecutiveFailures++
      // Exponential backoff: 30s → 60s → 120s → 5min cap — prevents rate-limit storms during dev restarts
      const backoffMs = _aisConsecutiveFailures <= 1 ? 30_000
        : _aisConsecutiveFailures <= 3 ? 60_000
        : _aisConsecutiveFailures <= 6 ? 120_000
        : 5 * 60_000
      console.log(`${AIS_LOG_PREFIX} Disconnected (code=${code} reason=${reason?.toString() ?? ''}) failure#${_aisConsecutiveFailures}, retry in ${backoffMs / 1000}s`)
      _aisWs = null
      if (_aisReconnectTimer) clearTimeout(_aisReconnectTimer)
      _aisReconnectTimer = setTimeout(() => _connectAisStream(apiKey), backoffMs)
    })

    ws.on('error', (err: Error) => {
      console.warn(`${AIS_LOG_PREFIX} WebSocket error:`, err.message)
    })
  } catch (err) {
    console.warn(`${AIS_LOG_PREFIX} Failed to connect:`, err)
    if (!_aisShouldReconnect) return
    if (_aisReconnectTimer) clearTimeout(_aisReconnectTimer)
    _aisReconnectTimer = setTimeout(() => _connectAisStream(apiKey), 60_000)
  }
}

// ─── Portwatch types ──────────────────────────────────────────────────────────

type PortwatchFeature<T> = {
  attributes?: T | null
}

type PortwatchQueryResponse<T> = {
  features?: Array<PortwatchFeature<T>> | null
}

type PortwatchDisruptionRow = {
  eventid?: number
  eventtype?: string
  eventname?: string
  htmlname?: string
  htmldescription?: string
  alertlevel?: string
  country?: string | null
  fromdate?: number | string | null
  todate?: number | string | null
  severitytext?: string | null
  lat?: number | string | null
  long?: number | string | null
  editdate?: number | string | null
  affectedports?: string | null
  n_affectedports?: number | string | null
  pageid?: string | null
}

type PortwatchAssetRow = {
  portid?: string
  portname?: string
  fullname?: string | null
  country?: string | null
  lat?: number | string | null
  lon?: number | string | null
  pageid?: string | null
}

type PortwatchPortActivityRow = {
  date?: string | null
  portid?: string
  portname?: string
  country?: string | null
  portcalls?: number | string | null
  import?: number | string | null
  export?: number | string | null
  pageid?: string | null
}

type PortwatchPortStatsRow = {
  portcalls_sum?: number | string | null
  port_count?: number | string | null
}

type PortwatchChokepointActivityRow = {
  date?: string | null
  portid?: string
  portname?: string
  n_total?: number | string | null
  capacity?: number | string | null
  pageid?: string | null
}

type PortwatchChokepointStatsRow = {
  transit_sum?: number | string | null
  chokepoint_count?: number | string | null
  capacity_sum?: number | string | null
}

type YahooSearchNewsRow = {
  title?: string | null
  publisher?: string | null
  link?: string | null
  providerPublishTime?: number | string | { raw?: number } | null
  summary?: string | null
  snippet?: string | null
  description?: string | null
  summaryText?: string | null
}

type YahooSearchResponse = {
  news?: YahooSearchNewsRow[] | null
}

function disruptionTypeLabel(typeCode: string): string {
  switch (typeCode) {
    case 'DR':
      return 'Drought'
    case 'EQ':
      return 'Earthquake'
    case 'FL':
      return 'Flood'
    case 'OT':
      return 'Trade Disruption'
    case 'TC':
      return 'Tropical Cyclone'
    case 'VO':
      return 'Volcanic Activity'
    case 'WF':
      return 'Wildfire'
    default:
      return typeCode || 'Event'
  }
}

function normalizeAlertLevel(value: string | null | undefined): 'RED' | 'ORANGE' | 'YELLOW' | 'UNKNOWN' {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'RED' || normalized === 'ORANGE' || normalized === 'YELLOW') return normalized
  return 'UNKNOWN'
}

const ALERT_LEVEL_RANK: Record<'RED' | 'ORANGE' | 'YELLOW' | 'UNKNOWN', number> = {
  RED: 3,
  ORANGE: 2,
  YELLOW: 1,
  UNKNOWN: 0,
}

type PolymarketTagResponse = {
  label?: string | null
  slug?: string | null
}

type PolymarketMarketResponse = {
  id?: string | number
  slug?: string | null
  question?: string | null
  outcomes?: unknown
  outcomePrices?: unknown
  volume?: unknown
  volume24hr?: unknown
  liquidity?: unknown
  endDate?: string | null
  active?: unknown
  closed?: unknown
  archived?: unknown
  restricted?: unknown
}

type PolymarketEventResponse = {
  id?: string | number
  slug?: string | null
  title?: string | null
  category?: string | null
  subcategory?: string | null
  tags?: PolymarketTagResponse[] | null
  markets?: PolymarketMarketResponse[] | null
  volume?: unknown
  volume24hr?: unknown
  liquidity?: unknown
  endDate?: string | null
  active?: unknown
  closed?: unknown
  archived?: unknown
  restricted?: unknown
}

type PolymarketForecast = {
  id: string
  question: string
  eventTitle: string | null
  theme: string
  category: string | null
  subcategory: string | null
  tags: string[]
  endDate: string | null
  yesPrice: number | null
  noPrice: number | null
  leadingOutcome: string
  leadingProbability: number | null
  volume24hr: number | null
  volume: number | null
  liquidity: number | null
  url: string | null
  source: string
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
  }

  return null
}

function parsePolymarketArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  }

  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean)
      : []
  } catch {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
}

function isPastIsoTimestamp(value: string | null): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp < Date.now()
}

function comparePolymarketForecasts(a: PolymarketForecast, b: PolymarketForecast): number {
  const aPrimary = a.volume24hr ?? a.volume ?? 0
  const bPrimary = b.volume24hr ?? b.volume ?? 0
  if (bPrimary !== aPrimary) return bPrimary - aPrimary

  const aSecondary = a.liquidity ?? 0
  const bSecondary = b.liquidity ?? 0
  if (bSecondary !== aSecondary) return bSecondary - aSecondary

  return (b.leadingProbability ?? 0) - (a.leadingProbability ?? 0)
}

function classifyPolymarketTheme(text: string): string | null {
  const normalized = text.toLowerCase()
  const excludedKeywords = [
    'sports',
    'nba',
    'nfl',
    'mlb',
    'nhl',
    'ncaa',
    'champions league',
    'premier league',
    'super bowl',
    'formula 1',
    'f1 ',
    'ufc',
    'boxing',
    'tennis',
    'golf',
    'soccer',
    'football',
    'baseball',
    'basketball',
    'hockey',
    'cricket',
    'oscars',
    'grammys',
    'emmys',
    'awards',
    'music',
    'culture',
    'eurovision',
    'survivor',
    'big brother',
    'love island',
  ]

  if (excludedKeywords.some((keyword) => normalized.includes(keyword))) {
    return null
  }

  if ([
    'bitcoin',
    'btc',
    'ethereum',
    'eth',
    'solana',
    'crypto',
    'token',
    'stablecoin',
    'memecoin',
    'dogecoin',
    'xrp',
  ].some((keyword) => normalized.includes(keyword))) {
    return 'Crypto'
  }

  if ([
    'fed',
    'fomc',
    'cpi',
    'pce',
    'inflation',
    'gdp',
    'recession',
    'payroll',
    'jobs report',
    'unemployment',
    'rate cut',
    'rate hike',
    'treasury',
    'yield',
    'economy',
  ].some((keyword) => normalized.includes(keyword))) {
    return 'Macro'
  }

  if ([
    'ukraine',
    'russia',
    'china',
    'taiwan',
    'israel',
    'gaza',
    'iran',
    'tariff',
    'ceasefire',
    'war',
    'sanction',
    'nato',
    'european union',
    'geopolit',
    'middle east',
  ].some((keyword) => normalized.includes(keyword))) {
    return 'Geopolitics'
  }

  if ([
    'election',
    'president',
    'prime minister',
    'congress',
    'senate',
    'house',
    'governor',
    'mayor',
    'trump',
    'biden',
    'democrat',
    'republican',
    'parliament',
    'politics',
  ].some((keyword) => normalized.includes(keyword))) {
    return 'Politics'
  }

  if ([
    'nvidia',
    'tesla',
    'apple',
    'microsoft',
    'openai',
    'earnings',
    'ipo',
    'ai ',
    'artificial intelligence',
    'company',
    'stock',
    'nasdaq',
    's&p 500',
  ].some((keyword) => normalized.includes(keyword))) {
    return 'Business'
  }

  if (normalized.includes('crypto')) return 'Crypto'
  if (normalized.includes('politic')) return 'Politics'
  if (normalized.includes('world')) return 'Geopolitics'
  if (normalized.includes('business') || normalized.includes('technology') || normalized.includes('finance')) return 'Business'

  return 'Top market'
}

function selectPolymarketForecasts(events: PolymarketEventResponse[], limit: number): PolymarketForecast[] {
  const candidates = events
    .flatMap((event) => {
      if (coerceBoolean(event.closed) === true || coerceBoolean(event.archived) === true) {
        return []
      }

      const eventTitle = typeof event.title === 'string' && event.title.trim() ? event.title.trim() : null
      const category = typeof event.category === 'string' && event.category.trim() ? event.category.trim() : null
      const subcategory = typeof event.subcategory === 'string' && event.subcategory.trim() ? event.subcategory.trim() : null
      const tags = Array.isArray(event.tags)
        ? event.tags.flatMap((tag) => {
            const label = typeof tag?.label === 'string' ? tag.label.trim() : ''
            return label ? [label] : []
          })
        : []

      return (Array.isArray(event.markets) ? event.markets : [])
        .flatMap((market): PolymarketForecast[] => {
          if (
            coerceBoolean(market.active) === false ||
            coerceBoolean(market.closed) === true ||
            coerceBoolean(market.archived) === true
          ) {
            return []
          }

          const outcomes = parsePolymarketArray(market.outcomes)
          const prices = parsePolymarketArray(market.outcomePrices).map((price) => toFiniteNumber(price))
          if (outcomes.length !== 2 || prices.length !== 2) return []

          const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'yes')
          const noIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'no')
          if (yesIndex === -1 || noIndex === -1) return []

          const question = typeof market.question === 'string' && market.question.trim()
            ? market.question.trim()
            : eventTitle
          if (!question) return []

          const theme = classifyPolymarketTheme([question, eventTitle, category, subcategory, ...tags].filter(Boolean).join(' | '))
          if (!theme) return []

          const yesPrice = prices[yesIndex]
          const noPrice = prices[noIndex]
          const leadingOutcome = (yesPrice ?? -1) >= (noPrice ?? -1) ? 'Yes' : 'No'
          const leadingProbability = Math.max(yesPrice ?? 0, noPrice ?? 0) || null
          const endDate = typeof market.endDate === 'string' && market.endDate.trim()
            ? market.endDate.trim()
            : typeof event.endDate === 'string' && event.endDate.trim()
              ? event.endDate.trim()
              : null
          if (isPastIsoTimestamp(endDate)) return []
          const slug = typeof event.slug === 'string' && event.slug.trim()
            ? event.slug.trim()
            : typeof market.slug === 'string' && market.slug.trim()
              ? market.slug.trim()
              : null

          return [{
            id: String(market.id ?? `${slug ?? question}`),
            question,
            eventTitle,
            theme,
            category,
            subcategory,
            tags,
            endDate,
            yesPrice,
            noPrice,
            leadingOutcome,
            leadingProbability,
            volume24hr: toFiniteNumber(market.volume24hr) ?? toFiniteNumber(event.volume24hr),
            volume: toFiniteNumber(market.volume) ?? toFiniteNumber(event.volume),
            liquidity: toFiniteNumber(market.liquidity) ?? toFiniteNumber(event.liquidity),
            url: slug ? `https://polymarket.com/event/${slug}` : null,
            source: 'Polymarket Gamma API',
          }]
        })
        .sort(comparePolymarketForecasts)
        .slice(0, 1)
    })
    .sort(comparePolymarketForecasts)

  const deduped: PolymarketForecast[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const key = candidate.url ?? candidate.question.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(candidate)
  }

  const selected: PolymarketForecast[] = []
  for (const theme of ['Macro', 'Politics', 'Geopolitics', 'Crypto', 'Business']) {
    const match = deduped.find((forecast) => forecast.theme === theme && !selected.some((entry) => entry.id === forecast.id))
    if (match) selected.push(match)
    if (selected.length >= limit) return selected.slice(0, limit)
  }

  for (const forecast of deduped) {
    if (selected.some((entry) => entry.id === forecast.id)) continue
    selected.push(forecast)
    if (selected.length >= limit) break
  }

  return selected.slice(0, limit)
}

const APP_SUPPORT_DIR = join(homedir(), 'Library', 'Application Support', 'Charlie')
const LOCAL_STATE_DIR = join(APP_SUPPORT_DIR, 'state')
const LEGACY_LOCAL_STATE_DIR = join(homedir(), '.bterminal')

function localStateFile(name: string, dir = LOCAL_STATE_DIR): string {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  return join(dir, `${safeName}.json`)
}

async function readRequestBody(req: any): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function readLocalState(name: string): Promise<string | null> {
  try {
    const raw = await readFile(localStateFile(name), 'utf8')
    const parsed = JSON.parse(raw) as { value?: string | null }
    return typeof parsed.value === 'string' ? parsed.value : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        const raw = await readFile(localStateFile(name, LEGACY_LOCAL_STATE_DIR), 'utf8')
        const parsed = JSON.parse(raw) as { value?: string | null }
        return typeof parsed.value === 'string' ? parsed.value : null
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw legacyError
      }
    }
    throw error
  }
}

async function writeLocalState(name: string, value: string): Promise<void> {
  await mkdir(LOCAL_STATE_DIR, { recursive: true })
  const file = localStateFile(name)
  const tempFile = `${file}.tmp`
  await writeFile(tempFile, JSON.stringify({ value, updatedAt: new Date().toISOString() }), 'utf8')
  await rename(tempFile, file)
}

async function deleteLocalState(name: string): Promise<void> {
  try {
    await unlink(localStateFile(name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

function extractOpenAIText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const chunks: string[] = []
  for (const output of payload?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        chunks.push(content.text.trim())
      }
    }
  }

  return chunks.join('\n\n').trim()
}

function parseOpenAIJsonText<T>(value: string): T | null {
  const trimmed = value.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '')
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as T
  } catch {
    const objectStart = trimmed.indexOf('{')
    const objectEnd = trimmed.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as T
      } catch {
        return null
      }
    }

    const arrayStart = trimmed.indexOf('[')
    const arrayEnd = trimmed.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as T
      } catch {
        return null
      }
    }

    return null
  }
}

function isConnectionProvider(value: string): value is ConnectionProvider {
  return value === 'openai' || value === 'fred' || value === 'finnhub'
}

async function readKeychainValueForService(service: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', [
      'find-generic-password',
      '-a', KEYCHAIN_ACCOUNT,
      '-s', service,
      '-w',
    ])

    const value = stdout.trim()
    return value ? value : null
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stderr?: string }
    const stderr = execError.stderr ?? ''
    if (stderr.includes('could not be found') || execError.code === 44) return null
    throw error
  }
}

async function readLocalConnectionSecrets(): Promise<Partial<Record<ConnectionProvider, string>>> {
  try {
    const raw = await readFile(LOCAL_CONNECTIONS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      openai: typeof parsed.openai === 'string' ? parsed.openai : undefined,
      fred: typeof parsed.fred === 'string' ? parsed.fred : undefined,
      finnhub: typeof parsed.finnhub === 'string' ? parsed.finnhub : undefined,
    }
  } catch (error) {
    const execError = error as NodeJS.ErrnoException
    if (execError.code === 'ENOENT') return {}
    throw error
  }
}

async function writeLocalConnectionSecrets(nextSecrets: Partial<Record<ConnectionProvider, string>>): Promise<void> {
  await mkdir(LOCAL_CONNECTIONS_DIR, { recursive: true })
  await writeFile(LOCAL_CONNECTIONS_PATH, `${JSON.stringify(nextSecrets, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
}

async function readConnectionSecret(provider: ConnectionProvider): Promise<string | null> {
  if (process.platform !== 'darwin') {
    const secrets = await readLocalConnectionSecrets()
    const value = secrets[provider]?.trim()
    return value ? value : null
  }

  const config = CONNECTION_PROVIDER_CONFIG[provider]
  const currentValue = await readKeychainValueForService(config.service)
  if (currentValue) return currentValue

  for (const legacyService of config.legacyServices ?? []) {
    const legacyValue = await readKeychainValueForService(legacyService)
    if (legacyValue) {
      await writeConnectionSecret(provider, legacyValue)
      return legacyValue
    }
  }

  return null
}

async function writeConnectionSecret(provider: ConnectionProvider, value: string): Promise<void> {
  if (process.platform !== 'darwin') {
    const currentSecrets = await readLocalConnectionSecrets()
    await writeLocalConnectionSecrets({
      ...currentSecrets,
      [provider]: value,
    })
    return
  }

  const config = CONNECTION_PROVIDER_CONFIG[provider]
  await execFileAsync('/usr/bin/security', [
    'add-generic-password',
    '-U',
    '-a', KEYCHAIN_ACCOUNT,
    '-s', config.service,
    '-w', value,
  ])
}

async function deleteKeychainValueForService(service: string): Promise<void> {
  try {
    await execFileAsync('/usr/bin/security', [
      'delete-generic-password',
      '-a', KEYCHAIN_ACCOUNT,
      '-s', service,
    ])
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stderr?: string }
    const stderr = execError.stderr ?? ''
    if (stderr.includes('could not be found') || execError.code === 44) return
    throw error
  }
}

async function deleteConnectionSecret(provider: ConnectionProvider): Promise<void> {
  if (process.platform !== 'darwin') {
    const currentSecrets = await readLocalConnectionSecrets()
    const nextSecrets = { ...currentSecrets }
    delete nextSecrets[provider]
    await writeLocalConnectionSecrets(nextSecrets)
    return
  }

  const config = CONNECTION_PROVIDER_CONFIG[provider]
  await deleteKeychainValueForService(config.service)
  for (const legacyService of config.legacyServices ?? []) {
    await deleteKeychainValueForService(legacyService)
  }
}

function registerLocalStateMiddleware(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/local-state/')) return next()

    try {
      const name = decodeURIComponent(url.pathname.replace('/api/local-state/', '')).trim()
      if (!name) return sendError(res, 'state name required', 400)

      if (req.method === 'GET') {
        const value = await readLocalState(name)
        return sendJSON(res, { value })
      }

      if (req.method === 'PUT') {
        const body = await readRequestBody(req)
        const payload = body ? (JSON.parse(body) as { value?: unknown }) : {}
        if (typeof payload.value !== 'string') return sendError(res, 'value must be a string', 400)
        await writeLocalState(name, payload.value)
        return sendJSON(res, { ok: true })
      }

      if (req.method === 'DELETE') {
        await deleteLocalState(name)
        return sendJSON(res, { ok: true })
      }

      return sendError(res, 'method not allowed', 405)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[vite-local-state]', msg)
      return sendError(res, msg)
    }
  })
}

type TeleborsaChartRow = {
  timestamp: number
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface TeleborsaQuotePayload {
  symbol: string
  shortName: string
  longName: string
  dataSource: 'teleborsa-fida'
  quoteType: 'MUTUALFUND'
  typeDisp: 'MUTUAL FUND'
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketVolume: number
  regularMarketPreviousClose: number
  regularMarketOpen: number
  regularMarketDayHigh: number
  regularMarketDayLow: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  averageVolume: number
  averageDailyVolume10Day: number
  currency: string
  marketState: string
  exchange: string
  exchangeTimezoneName: string
  country: string
}

const TMF_FETCH_TIMEOUT_MS = 7_000

const LASTAMPA_FUNDS_BASE = 'https://finanza.lastampa.it'
const LASTAMPA_FUNDS_SEARCH_URL = `${LASTAMPA_FUNDS_BASE}/Funds/ricercaFondi.aspx`

type TeleborsaFundSource = 'teleborsa' | 'lastampa'

type TeleborsaFundResolution = {
  symbol: string
  source: TeleborsaFundSource
  pageUrl: string
  pageHtml: string
  chartHtml: string
}

const teleborsaFundResolutionCache = new Map<string, Promise<TeleborsaFundResolution | null>>()

function normalizeTeleborsaSymbol(symbol: string): string {
  return decodeURIComponent(symbol).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function looksLikeTeleborsaFundCandidate(symbol: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(normalizeTeleborsaSymbol(symbol))
}

function buildTeleborsaFundCode(symbol: string): string {
  return Buffer.from(`FC.${normalizeTeleborsaSymbol(symbol)}`).toString('base64').replace(/=+$/g, '')
}

function buildTeleborsaFundUrl(symbol: string, suffix = ''): string {
  const normalized = normalizeTeleborsaSymbol(symbol)
  const code = buildTeleborsaFundCode(normalized)
  return `https://www.teleborsa.it/fondi/${normalized.toLowerCase()}-${code}${suffix}`
}

function buildTeleborsaFundSearchCandidates(query: string): string[] {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  if (!trimmed) return []

  const candidates = new Set<string>([trimmed])
  const symbol = extractTeleborsaSearchSymbol(trimmed)
  if (symbol) candidates.add(symbol)

  const fcMatch = trimmed.match(/^FC\.([A-Za-z0-9.-]{4,16})$/i)
  if (fcMatch) {
    candidates.add(normalizeTeleborsaSymbol(fcMatch[1]))
  }

  const compactFcMatch = trimmed.match(/^FC([A-Za-z0-9.-]{4,16})$/i)
  if (compactFcMatch) {
    candidates.add(normalizeTeleborsaSymbol(compactFcMatch[1]))
  }

  const symbolCandidate = symbol ?? normalizeTeleborsaSymbol(trimmed)
  const compactSymbol = symbolCandidate.match(/^FC([A-Z0-9.-]{4,16})$/i)?.[1] ?? symbolCandidate
  if (/^[A-Z]{2,}[A-Z0-9]{2,}$/i.test(compactSymbol)) candidates.add(compactSymbol)

  return Array.from(candidates).filter(Boolean)
}

function buildLastampaFundSearchUrl(query: string, textType: 'DESC_F' | 'COD_F' = 'DESC_F', managerId?: string): string {
  const params = new URLSearchParams({
    T_F: '50',
    [textType]: query,
  })

  if (managerId) {
    params.set('G_F', managerId)
  }

  return `${LASTAMPA_FUNDS_SEARCH_URL}?${params}`
}

async function fetchTeleborsaPageOrNull(url: string): Promise<string | null> {
  try {
    return await fetchTeleborsaPage(url)
  } catch {
    return null
  }
}

function extractTeleborsaFundName(html: string): string {
  return cleanTeleborsaText(
    extractMatch(html, /<h1 class="title fc1">([\s\S]*?)<\/h1>/i) ??
      extractMatch(html, /<h1[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/i) ??
      extractMatch(html, /<meta property="og:title"\s+content="([^"]+)"/i) ??
      extractMatch(html, /<title>([\s\S]*?)<\/title>/i)
  )
}

function extractTeleborsaFundPrice(html: string): number | null {
  return parseLocalizedNumber(
    extractMatch(html, /id="ctl00_phContents_ctlHeader_lblPrice"[^>]*>([\s\S]*?)</i) ??
      extractMatch(html, /id="ctl00_ContentWideLeft_HeaderTitle_lblPrice"[^>]*>([\s\S]*?)</i) ??
      extractMatch(html, /id="[^"]*lblPrice"[^>]*>([\s\S]*?)</i)
  )
}

function extractTeleborsaFundChangePercent(html: string): number | null {
  return parseLocalizedNumber(
    extractMatch(html, /id="ctl00_phContents_ctlHeader_lblPercentChange"[^>]*>([\s\S]*?)</i) ??
      extractMatch(html, /id="ctl00_ContentWideLeft_HeaderTitle_lblPercentChange"[^>]*>([\s\S]*?)</i) ??
      extractMatch(html, /id="[^"]*lblPercentChange"[^>]*>([\s\S]*?)</i)
  )
}

function extractTeleborsaFundSearchHref(html: string): string | null {
  const match =
    html.match(/href="([^"]*\/Funds\/Fondo\/Scheda\/[^"]*\/F\/FC\.[^"]+)"/i) ??
    html.match(/href="([^"]*\/Funds\/Fondo\/Scheda\/[^"]+)"/i)

  return match?.[1] ? new URL(match[1], LASTAMPA_FUNDS_BASE).toString() : null
}

function extractTeleborsaFundSymbolFromHref(href: string): string | null {
  const match = href.match(/\/F\/FC\.([A-Za-z0-9]+)\//i) ?? href.match(/FC\.([A-Za-z0-9]+)\//i)
  return match?.[1] ? normalizeTeleborsaSymbol(match[1]) : null
}

async function resolveLastampaFundPage(query: string): Promise<TeleborsaFundResolution | null> {
  const managerId = /allianz/i.test(query) || /^AZAUT\d+$/i.test(query.replace(/[^A-Z0-9]/gi, '')) ? '2253' : undefined
  const candidates = buildTeleborsaFundSearchCandidates(query)
  const triedSearchUrls = new Set<string>()

  for (const candidate of candidates) {
    const searchUrls = [
      buildLastampaFundSearchUrl(candidate, 'DESC_F', managerId),
      buildLastampaFundSearchUrl(candidate, 'COD_F', managerId),
    ]

    if (/^[A-Z0-9]{4,16}$/i.test(candidate) && !candidate.startsWith('FC.')) {
      searchUrls.push(buildLastampaFundSearchUrl(`FC.${candidate}`, 'COD_F', managerId))
    }

    for (const searchUrl of searchUrls) {
      if (triedSearchUrls.has(searchUrl)) continue
      triedSearchUrls.add(searchUrl)

      const searchHtml = await fetchTeleborsaPageOrNull(searchUrl)
      if (!searchHtml) continue

      const href = extractTeleborsaFundSearchHref(searchHtml)
      if (!href) continue

      const pageHtml = await fetchTeleborsaPageOrNull(href)
      if (!pageHtml) continue
      if (extractTeleborsaFundPrice(pageHtml) == null || !extractTeleborsaFundName(pageHtml)) continue

      const symbol = extractTeleborsaFundSymbolFromHref(href) ?? extractTeleborsaSearchSymbol(query) ?? normalizeTeleborsaSymbol(query)
      return {
        symbol,
        source: 'lastampa',
        pageUrl: href,
        pageHtml,
        chartHtml: pageHtml,
      }
    }
  }

  return null
}

async function resolveTeleborsaFundPage(query: string): Promise<TeleborsaFundResolution | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  const cacheKey = trimmed.toLowerCase()
  const cached = teleborsaFundResolutionCache.get(cacheKey)
  if (cached) return cached

  const request = (async () => {
    const symbol = extractTeleborsaSearchSymbol(trimmed)
    if (symbol && looksLikeTeleborsaFundCandidate(symbol)) {
      const pageUrl = buildTeleborsaFundUrl(symbol)
      const pageHtml = await fetchTeleborsaPageOrNull(pageUrl)
      if (pageHtml && isTeleborsaFundPage(pageHtml, symbol)) {
        const chartHtml = (await fetchTeleborsaPageOrNull(buildTeleborsaFundUrl(symbol, '/grafico'))) ?? pageHtml
        return {
          symbol,
          source: 'teleborsa',
          pageUrl,
          pageHtml,
          chartHtml,
        }
      }
    }

    return resolveLastampaFundPage(trimmed)
  })().catch(() => null)

  teleborsaFundResolutionCache.set(cacheKey, request)
  return request
}

async function resolveTeleborsaChartHtml(resolution: TeleborsaFundResolution): Promise<string> {
  if (resolution.source === 'lastampa' || resolution.pageHtml.includes('historical:')) {
    return resolution.pageHtml
  }

  return (await fetchTeleborsaPageOrNull(buildTeleborsaFundUrl(resolution.symbol, '/grafico'))) ?? resolution.pageHtml
}

async function fetchTextWithNodeHttps(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  redirectsRemaining = 4
): Promise<{ body: string; statusCode: number }> {
  const { default: https } = await import('node:https')

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const statusCode = response.statusCode ?? 0
      const location = response.headers.location

      if (statusCode >= 300 && statusCode < 400 && location && redirectsRemaining > 0) {
        response.resume()
        const redirectUrl = new URL(location, url).toString()
        fetchTextWithNodeHttps(redirectUrl, headers, timeoutMs, redirectsRemaining - 1)
          .then(resolve)
          .catch(reject)
        return
      }

      response.setEncoding('utf8')
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        resolve({ body, statusCode })
      })
    })

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Teleborsa request timed out after ${timeoutMs}ms`))
    })
    request.on('error', reject)
  })
}

async function fetchTeleborsaPage(url: string): Promise<string> {
  const headers = {
    'User-Agent': 'Charlie/1.0',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  }
  const response = await fetchTextWithNodeHttps(url, headers, TMF_FETCH_TIMEOUT_MS)

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Teleborsa request failed: ${response.statusCode}`)
  }

  return response.body
}

function extractMatch(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern)
  return match?.[1] ?? null
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    quot: '"',
    nbsp: ' ',
    lt: '<',
    gt: '>',
    agrave: 'a',
    egrave: 'e',
    igrave: 'i',
    ograve: 'o',
    ugrave: 'u',
    Agrave: 'A',
    Egrave: 'E',
    Igrave: 'I',
    Ograve: 'O',
    Ugrave: 'U',
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
    ndash: '-',
    mdash: '-',
  }

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&([a-zA-Z]+);/g, (_, name) => named[name] ?? '')
}

function cleanTeleborsaText(value: string | null | undefined): string {
  if (!value) return ''
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseLocalizedNumber(value: string | null | undefined): number | null {
  const text = cleanTeleborsaText(value)
  if (!text || text === '---') return null

  const normalized = text
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.+-]/g, '')

  if (!normalized || normalized === '+' || normalized === '-' || normalized === '.') return null

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseItalianDate(value: string | null | undefined): string | undefined {
  const text = cleanTeleborsaText(value)
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return undefined
  const [, day, month, year] = match
  return new Date(Date.UTC(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, Number.parseInt(day, 10))).toISOString()
}

function isTeleborsaFundPage(html: string, symbol: string): boolean {
  const canonical = extractMatch(html, /rel="canonical"\s+href="([^"]+)"/i)
  if (!canonical || !canonical.includes('/fondi/')) return false
  if (/Errore del server|Si è verificato un problema|Errors\/404/i.test(html)) return false
  return canonical.includes(buildTeleborsaFundCode(symbol))
}

function parseTeleborsaLabelMap(html: string): Record<string, string> {
  const labels: Record<string, string> = {}
  const itemRegex = /<div id="[^"]+" class="scheda-panel--body--data--item">[\s\S]*?<label>([\s\S]*?)<\/label>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi
  const listItemRegex = /<li[^>]*>\s*([^<]+?)\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi

  for (const match of html.matchAll(itemRegex)) {
    const label = cleanTeleborsaText(match[1])
    if (!label) continue
    labels[label] = cleanTeleborsaText(match[2])
  }

  for (const match of html.matchAll(listItemRegex)) {
    const label = cleanTeleborsaText(match[1])
    const value = cleanTeleborsaText(match[2])
    if (!label || !value || labels[label]) continue
    labels[label] = value
  }

  return labels
}

function extractTeleborsaBracketedArray(source: string, openBracketIndex: number): string | null {
  if (openBracketIndex < 0 || source[openBracketIndex] !== '[') return null

  let depth = 0
  let inString: '"' | "'" | null = null
  let escaped = false

  for (let index = openBracketIndex; index < source.length; index += 1) {
    const char = source[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = char
      continue
    }

    if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) return source.slice(openBracketIndex, index + 1)
    }
  }

  return null
}

function normalizeTeleborsaPercent(value: number | null): number | null {
  if (value == null) return null
  return Number.parseFloat(value.toFixed(2))
}

function parseTeleborsaChartRows(html: string): TeleborsaChartRow[] {
  const historicalMatches = html.matchAll(/historical\s*:/gi)
  let parsedRows: unknown[] = []

  for (const match of historicalMatches) {
    const startIndex = match.index + match[0].length
    const openBracketIndex = html.indexOf('[', startIndex)
    const raw = extractTeleborsaBracketedArray(html, openBracketIndex)
    if (!raw) continue

    try {
      const rows = JSON.parse(raw) as unknown
      if (Array.isArray(rows) && rows.length > parsedRows.length) parsedRows = rows
    } catch {
      continue
    }
  }

  if (!Array.isArray(parsedRows)) return []

  return parsedRows
    .filter((row): row is number[] => Array.isArray(row) && row.length >= 2)
    .map((row) => {
      const timestamp = Number(row[0])
      const close = Number(row[5] ?? row[2] ?? row[1] ?? 0)
      const ohlc = [row[1], row[2], row[3], row[4], row[5]]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
      const open = Number(row[1] ?? close)
      const high = ohlc.length ? Math.max(...ohlc) : close
      const low = ohlc.length ? Math.min(...ohlc) : close

      return {
        timestamp,
        date: new Date(timestamp).toISOString(),
        open: Number.isFinite(open) && open > 0 ? open : close,
        high: Number.isFinite(high) && high > 0 ? high : close,
        low: Number.isFinite(low) && low > 0 ? low : close,
        close,
        volume: Number(row[6] ?? 0) || 0,
      }
    })
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => left.timestamp - right.timestamp)
}

function buildTeleborsaSnapshotChartRows(quote: TeleborsaQuotePayload | null): TeleborsaChartRow[] {
  if (!quote?.regularMarketPrice) return []
  const timestamp = Date.now()
  const close = quote.regularMarketPrice

  return [{
    timestamp,
    date: new Date(timestamp).toISOString(),
    open: quote.regularMarketOpen || close,
    high: quote.regularMarketDayHigh || close,
    low: quote.regularMarketDayLow || close,
    close,
    volume: quote.regularMarketVolume || 0,
  }]
}

function findQuoteAtOrBefore(rows: TeleborsaChartRow[], target: number): TeleborsaChartRow | null {
  let candidate: TeleborsaChartRow | null = null
  for (const row of rows) {
    if (row.timestamp <= target) candidate = row
    else break
  }
  return candidate ?? rows[0] ?? null
}

function computeTrailingReturn(rows: TeleborsaChartRow[], target: number): number | null {
  const latest = rows.at(-1)
  const base = findQuoteAtOrBefore(rows, target)
  if (!latest || !base || !base.close) return null
  return normalizeTeleborsaPercent(((latest.close / base.close) - 1) * 100)
}

function computeTrailingReturnMap(rows: TeleborsaChartRow[]): {
  ytd: number | null
  oneMonth: number | null
  threeMonth: number | null
  oneYear: number | null
  threeYear: number | null
  fiveYear: number | null
} {
  const latest = rows.at(-1)
  if (!latest) {
    return {
      ytd: null,
      oneMonth: null,
      threeMonth: null,
      oneYear: null,
      threeYear: null,
      fiveYear: null,
    }
  }

  const now = latest.timestamp
  const date = new Date(now)
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayMs = 24 * 60 * 60 * 1000

  return {
    ytd: computeTrailingReturn(rows, startOfYear),
    oneMonth: computeTrailingReturn(rows, now - 31 * dayMs),
    threeMonth: computeTrailingReturn(rows, now - 92 * dayMs),
    oneYear: computeTrailingReturn(rows, now - 366 * dayMs),
    threeYear: computeTrailingReturn(rows, now - 3 * 366 * dayMs),
    fiveYear: computeTrailingReturn(rows, now - 5 * 366 * dayMs),
  }
}

function buildTeleborsaQuote(
  symbol: string,
  html: string,
  rows: TeleborsaChartRow[] = []
): TeleborsaQuotePayload | null {
  const normalizedSymbol = normalizeTeleborsaSymbol(symbol)
  const labels = parseTeleborsaLabelMap(html)
  const name = extractTeleborsaFundName(html) || normalizedSymbol
  const market = cleanTeleborsaText(
    extractMatch(html, /<p>\s*Mercato:\s*([\s\S]*?)<\/p>/i) ??
      extractMatch(html, /<li>\s*Tipologia\s*<span[^>]*>([\s\S]*?)<\/span>/i) ??
      labels['Tipologia']
  ) || 'Teleborsa/FIDA'
  const price = extractTeleborsaFundPrice(html)
  if (price == null) return null

  const changePercent = extractTeleborsaFundChangePercent(html) ?? 0
  const previousClose = changePercent === -100 ? price : price / (1 + changePercent / 100)
  const yearAgo = rows.length ? (rows.at(-1)?.timestamp ?? 0) - 366 * 24 * 60 * 60 * 1000 : null
  const rollingRows = yearAgo != null ? rows.filter((row) => row.timestamp >= yearAgo) : rows
  const fiftyTwoWeekHigh = rollingRows.length ? Math.max(...rollingRows.map((row) => row.close)) : price
  const fiftyTwoWeekLow = rollingRows.length ? Math.min(...rollingRows.map((row) => row.close)) : price

  return {
    symbol: normalizedSymbol,
    shortName: name,
    longName: name,
    dataSource: 'teleborsa-fida',
    quoteType: 'MUTUALFUND',
    typeDisp: 'MUTUAL FUND',
    regularMarketPrice: price,
    regularMarketChange: Number.parseFloat((price - previousClose).toFixed(4)),
    regularMarketChangePercent: Number.parseFloat(changePercent.toFixed(2)),
    regularMarketVolume: 0,
    regularMarketPreviousClose: Number.parseFloat(previousClose.toFixed(4)),
    regularMarketOpen: price,
    regularMarketDayHigh: price,
    regularMarketDayLow: price,
    fiftyTwoWeekHigh: Number.parseFloat(fiftyTwoWeekHigh.toFixed(4)),
    fiftyTwoWeekLow: Number.parseFloat(fiftyTwoWeekLow.toFixed(4)),
    averageVolume: 0,
    averageDailyVolume10Day: 0,
    currency: labels['Valuta'] || labels['Currency'] || 'EUR',
    marketState: 'CLOSED',
    exchange: market,
    exchangeTimezoneName: 'Europe/Rome',
    country: 'Italy',
  }
}

function buildTeleborsaWorkbench(symbol: string, pageHtml: string, chartRows: TeleborsaChartRow[]): Record<string, unknown> | null {
  const quote = buildTeleborsaQuote(symbol, pageHtml, chartRows)
  if (!quote) return null

  const labels = parseTeleborsaLabelMap(pageHtml)
  const name = extractTeleborsaFundName(pageHtml) || String(quote.symbol)
  const canonicalUrl = extractMatch(pageHtml, /rel="canonical"\s+href="([^"]+)"/i) ?? buildTeleborsaFundUrl(symbol)
  const market = cleanTeleborsaText(
    extractMatch(pageHtml, /<p>\s*Mercato:\s*([\s\S]*?)<\/p>/i) ??
      extractMatch(pageHtml, /<li>\s*Tipologia\s*<span[^>]*>([\s\S]*?)<\/span>/i) ??
      labels['Tipologia']
  ) || 'Fondi Comuni d\'Investimento'
  const description = cleanTeleborsaText(extractMatch(pageHtml, /name="description"\s+content="([^"]+)"/i))
  const updatedAt = cleanTeleborsaText(
    extractMatch(pageHtml, /id="ctl00_ContentWideLeft_HeaderTitle_lblLastUpdate"[^>]*>([\s\S]*?)</i) ??
      extractMatch(pageHtml, /Ultimo aggiornamento:\s*<strong>([^<]+)<\/strong>/i) ??
      labels['Ultimo aggiornamento']
  )
  const trailing = computeTrailingReturnMap(chartRows)
  const rating = parseLocalizedNumber(labels['Rating'])
  const category = labels['Categoria Assogestioni'] || labels['Cat. Assogestioni'] || labels['Cat Assogestioni'] || labels['Tipologia'] || 'Mutual Fund'
  const managementCompany = labels['Società di Gestione'] || labels['Nome del gestore'] || labels['Gestore']

  return {
    quote,
    instrumentKind: 'fund',
    instrumentLabel: 'MUTUAL FUND',
    profile: {
      sector: category,
      industry: labels['Tipologia'] || market,
      website: canonicalUrl,
      country: 'Italy',
      city: undefined,
      state: undefined,
      longBusinessSummary: description || `${name} mutual fund data from Teleborsa/FIDA.`,
      fullTimeEmployees: undefined,
      overallRisk: undefined,
      officers: [],
    },
    sectorContext: {
      sector: category,
      industry: labels['Tipologia'] || market,
      sectorEtf: undefined,
    },
    calendar: null,
    analysis: {
      targetLowPrice: undefined,
      targetMeanPrice: undefined,
      targetHighPrice: undefined,
      targetMedianPrice: undefined,
      recommendationKey: undefined,
      recommendationMean: undefined,
      analystOpinionCount: undefined,
      grossMargins: undefined,
      operatingMargins: undefined,
      profitMargins: undefined,
      revenueGrowth: undefined,
      earningsGrowth: undefined,
      returnOnAssets: undefined,
      returnOnEquity: undefined,
      totalCash: parseLocalizedNumber(labels['Patrimonio del fondo']),
      totalDebt: undefined,
      freeCashflow: undefined,
      operatingCashflow: undefined,
      recommendationTrend: [],
      earningsTrend: [],
      technicalOutlooks: [],
      snapshotScores: [],
      valuationDescription: undefined,
      valuationRelativeValue: undefined,
      insightRecommendation: undefined,
      reports: [],
      developments: updatedAt
        ? [{ headline: `Latest Teleborsa/FIDA update: ${updatedAt}`, date: parseItalianDate(updatedAt) ?? updatedAt }]
        : [],
    },
    ownership: {
      institutions: [],
      insiders: [],
      insidersPercentHeld: undefined,
      institutionsPercentHeld: undefined,
      institutionsFloatPercentHeld: undefined,
      institutionsCount: undefined,
      netInsiderShares: undefined,
      netInsiderCount: undefined,
    },
    filings: [],
    fund: {
      family: managementCompany || undefined,
      categoryName: category,
      legalType: labels['Tipologia'] || undefined,
      description: description || undefined,
      managerName: labels['Nome del gestore'] || managementCompany || undefined,
      managerBio: undefined,
      managerStartDate: parseItalianDate(labels['Data di partenza']),
      netAssets: parseLocalizedNumber(labels['Patrimonio del fondo']),
      netExpenseRatio: null,
      grossExpenseRatio: null,
      annualHoldingsTurnover: null,
      yield: null,
      navPrice: quote.regularMarketPrice,
      ytdReturn: trailing.ytd ?? parseLocalizedNumber(labels['YTD']),
      oneYearReturn: trailing.oneYear ?? parseLocalizedNumber(labels['1 anno']),
      threeYearReturn: trailing.threeYear ?? parseLocalizedNumber(labels['3 anni']),
      fiveYearReturn: trailing.fiveYear,
      categoryOneYearReturn: null,
      categoryThreeYearReturn: null,
      categoryFiveYearReturn: null,
      riskRating: null,
      returnRating: rating && rating > 0 ? rating : null,
      initialInvestment: null,
      trailingReturns: [
        { label: 'YTD', value: trailing.ytd ?? parseLocalizedNumber(labels['YTD']), categoryValue: null },
        { label: '1M', value: trailing.oneMonth, categoryValue: null },
        { label: '3M', value: trailing.threeMonth ?? parseLocalizedNumber(labels['3 mesi']), categoryValue: null },
        { label: '1Y', value: trailing.oneYear ?? parseLocalizedNumber(labels['1 anno']), categoryValue: null },
        { label: '3Y', value: trailing.threeYear ?? parseLocalizedNumber(labels['3 anni']), categoryValue: null },
        { label: '5Y', value: trailing.fiveYear, categoryValue: null },
        { label: '10Y', value: null, categoryValue: null },
      ],
      annualReturns: [],
      riskStatistics: [],
      holdings: [],
      sectorWeightings: [],
      assetAllocation: [],
    },
  }
}

function extractTeleborsaSearchSymbol(query: string): string | null {
  const trimmed = query.trim()
  const parenthetical = trimmed.match(/\(([A-Za-z0-9.-]{4,16})\)\s*$/)
  if (parenthetical) {
    return normalizeTeleborsaSymbol(parenthetical[1])
  }

  const fcCode = trimmed.match(/^FC\.([A-Za-z0-9.-]{4,16})$/i)
  if (fcCode) {
    return normalizeTeleborsaSymbol(fcCode[1])
  }

  if (/^[A-Za-z0-9.-]{4,16}$/.test(trimmed)) {
    return normalizeTeleborsaSymbol(trimmed)
  }

  return null
}

function extractOpenAIStreamDelta(event: any): string {
  if (typeof event?.delta === 'string' && String(event?.type ?? '') === 'response.output_text.delta') {
    return event.delta
  }

  return ''
}

function formatPanelCompanionInput(args: {
  activePanel: string
  panels: string[]
  messages: Array<{ role?: string; content?: string }>
  contexts: Array<{
    panel?: string
    title?: string
    summary?: string
    capturedAt?: string
    source?: string
    renderedText?: string
    data?: unknown
  }>
}): string {
  const conversation = args.messages
    .map((message) => `${String(message.role ?? 'user').toUpperCase()}: ${String(message.content ?? '').trim()}`)
    .join('\n\n')

  const panelContexts = args.contexts
    .map((context) => JSON.stringify({
      panel: context.panel,
      title: context.title,
      summary: context.summary,
      capturedAt: context.capturedAt,
      source: context.source,
      renderedText: context.renderedText,
      data: context.data,
    }, null, 2))
    .join('\n\n')

  return [
    'You are answering from a Charlie workspace snapshot.',
    `Active panel: ${args.activePanel}`,
    `Included panels: ${args.panels.join(', ')}`,
    '',
    'Conversation:',
    conversation || 'USER: No prior conversation.',
    '',
    'Panel contexts:',
    panelContexts || 'No panel contexts were supplied.',
  ].join('\n')
}

function marketDataMiddleware(): Plugin {
  const yahooQuoteCache = new Map<string, { expiresAt: number; staleUntil: number; payload: unknown[] }>()
  const polymarketForecastCache = new Map<string, { expiresAt: number; payload: unknown }>()

  const registerMarketDataMiddlewares = (server: ViteDevServer | PreviewServer) => {
    registerLocalStateMiddleware(server)

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname

        if (!path.startsWith('/api/yf/')) return next()

        try {
          const route = path.replace('/api/yf/', '')

          // GET /api/yf/quotes?symbols=AAPL,MSFT
          if (route === 'quotes') {
            const symbolsParam = url.searchParams.get('symbols') ?? ''
            const symbols = Array.from(new Set(symbolsParam.split(',').map((s) => s.trim()).filter(Boolean)))
            if (!symbols.length) return sendError(res, 'symbols param required', 400)
            const cacheKey = symbols.slice().sort().join(',')
            const cached = yahooQuoteCache.get(cacheKey)
            const now = Date.now()

            if (cached && cached.expiresAt > now) {
              return sendJSON(res, cached.payload)
            }

            try {
              const filtered = await runYahooRequest(`quote(${cacheKey})`, async (finance) => {
                const results = await fetchYahooQuotes(finance, symbols)
                if (!results.length) {
                  throw new Error(`Yahoo quote fetch returned no data for ${cacheKey}`)
                }
                return results
              })

              if (filtered.length) {
                yahooQuoteCache.set(cacheKey, {
                  expiresAt: now + YAHOO_QUOTE_CACHE_TTL_MS,
                  staleUntil: now + YAHOO_QUOTE_STALE_TTL_MS,
                  payload: filtered,
                })
              }

              return sendJSON(res, filtered)
            } catch (error) {
              if (cached && cached.payload.length > 0 && cached.staleUntil > now) {
                console.warn(`[vite-yf] serving stale quotes for ${cacheKey}`, error)
                return sendJSON(res, cached.payload)
              }

              throw error
            }
          }

          // GET /api/yf/chart/AAPL?range=1y&interval=1d
          if (route.startsWith('chart/')) {
            const symbol = decodeURIComponent(route.replace('chart/', ''))
            const range = url.searchParams.get('range') ?? '1y'
            const interval = (url.searchParams.get('interval') ?? '1d') as '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo'
            const explicitPeriod1 = url.searchParams.get('period1')?.trim() ?? ''
            const explicitPeriod2 = url.searchParams.get('period2')?.trim() ?? ''
            // yahoo-finance2 chart() requires period1/period2 (not a `range` shorthand).
            // rangeToPeriods sets period2 = tomorrow so today's close is always included,
            // and period1 = today for '1d' so we get today's intraday bars.
            const { period1, period2 } = explicitPeriod1 && explicitPeriod2
              ? { period1: explicitPeriod1, period2: explicitPeriod2 }
              : rangeToPeriods(range)
            const data = await runYahooRequest(`chart(${symbol})`, (finance) => finance.chart(symbol, { period1, period2, interval }))
            return sendJSON(res, data)
          }

          // GET /api/yf/summary/AAPL?modules=summaryProfile,summaryDetail
          if (route.startsWith('summary/')) {
            const symbol = decodeURIComponent(route.replace('summary/', ''))
            const modulesParam = url.searchParams.get('modules') ?? 'summaryDetail'
            const modules = modulesParam.split(',')
            const data = await runYahooRequest(`summary(${symbol})`, (finance) => finance.quoteSummary(symbol, { modules }))
            return sendJSON(res, data)
          }

          // GET /api/yf/insights/AAPL?reportsCount=5
          if (route.startsWith('insights/')) {
            const symbol = decodeURIComponent(route.replace('insights/', ''))
            const reportsCount = parseInt(url.searchParams.get('reportsCount') ?? '5', 10)
            const data = await runYahooRequest(`insights(${symbol})`, (finance) => finance.insights(symbol, { reportsCount }))
            return sendJSON(res, data)
          }

          // GET /api/yf/fundamentals/AAPL?type=annual&module=financials&period1=2020-01-01
          if (route.startsWith('fundamentals/')) {
            const symbol = decodeURIComponent(route.replace('fundamentals/', ''))
            const type = url.searchParams.get('type') ?? 'annual'
            const module = url.searchParams.get('module') ?? 'financials'
            const period1 = url.searchParams.get('period1') ?? '2020-01-01'
            const period2 = url.searchParams.get('period2') ?? undefined
            const data = await runYahooRequest(`fundamentals(${symbol})`, (finance) => finance.fundamentalsTimeSeries(symbol, {
              type,
              module,
              period1,
              ...(period2 ? { period2 } : {}),
            }))
            return sendJSON(res, data)
          }

          // GET /api/yf/search?q=apple&newsCount=5
          if (route === 'search') {
            const q = url.searchParams.get('q') ?? ''
            if (!q) return sendError(res, 'q param required', 400)
            const newsCount = parseInt(url.searchParams.get('newsCount') ?? '0', 10)
            const data = await runYahooRequest(`search(${q})`, (finance) => finance.search(q, { newsCount }, { validateResult: false }))
            return sendJSON(res, data)
          }

          return sendError(res, `Unknown route: ${route}`, 404)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[vite-yf]', msg)
          return sendError(res, msg)
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname

        if (!path.startsWith('/api/tmf/')) return next()
        const route = path.replace('/api/tmf/', '')

        try {
          if (route.startsWith('quote/')) {
            const symbol = decodeURIComponent(route.replace('quote/', ''))
            const resolution = await resolveTeleborsaFundPage(symbol)
            if (!resolution) return sendJSON(res, null, 404)
            const chartHtml = await resolveTeleborsaChartHtml(resolution)
            const quote = buildTeleborsaQuote(resolution.symbol, resolution.pageHtml, parseTeleborsaChartRows(chartHtml))
            return sendJSON(res, quote)
          }

          if (route.startsWith('workbench/')) {
            const symbol = decodeURIComponent(route.replace('workbench/', ''))
            const resolution = await resolveTeleborsaFundPage(symbol)
            if (!resolution) return sendJSON(res, null, 404)
            const chartHtml = await resolveTeleborsaChartHtml(resolution)
            const workbench = buildTeleborsaWorkbench(resolution.symbol, resolution.pageHtml, parseTeleborsaChartRows(chartHtml))
            return sendJSON(res, workbench)
          }

          if (route.startsWith('chart/')) {
            const symbol = decodeURIComponent(route.replace('chart/', ''))
            const resolution = await resolveTeleborsaFundPage(symbol)
            if (!resolution) return sendJSON(res, [], 404)
            const chartHtml = await resolveTeleborsaChartHtml(resolution)
            const chartRows = parseTeleborsaChartRows(chartHtml)
            if (chartRows.length) return sendJSON(res, chartRows)
            return sendJSON(res, buildTeleborsaSnapshotChartRows(buildTeleborsaQuote(resolution.symbol, resolution.pageHtml)))
          }

          if (route === 'search') {
            const query = url.searchParams.get('q') ?? ''
            const resolution = await resolveTeleborsaFundPage(query)
            if (!resolution) return sendJSON(res, [])

            const chartHtml = await resolveTeleborsaChartHtml(resolution)
            const quote = buildTeleborsaQuote(resolution.symbol, resolution.pageHtml, parseTeleborsaChartRows(chartHtml))
            if (!quote) return sendJSON(res, [])
            const labels = parseTeleborsaLabelMap(resolution.pageHtml)

            return sendJSON(res, [
              {
                symbol: resolution.symbol,
                shortname: quote.shortName,
                longname: quote.longName,
                dataSource: 'teleborsa-fida',
                exchDisp: 'Teleborsa/FIDA',
                typeDisp: 'MUTUAL FUND',
                sector: labels['Categoria Assogestioni'] ?? labels['Cat. Assogestioni'] ?? labels['Tipologia'],
              },
            ])
          }

          return sendError(res, `Unknown route: ${route}`, 404)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const isExpectedUpstreamOutage =
            msg.includes('Teleborsa request failed') ||
            msg.includes('Teleborsa temporarily unavailable') ||
            msg.includes('timeout')

          if (!isExpectedUpstreamOutage) {
            console.error('[vite-tmf]', msg)
            return sendError(res, msg)
          }

          if (route.startsWith('quote/') || route.startsWith('workbench/')) {
            return sendJSON(res, null, 200)
          }
          if (route.startsWith('chart/') || route === 'search') {
            return sendJSON(res, [], 200)
          }

          return sendJSON(res, null, 200)
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/api/gpr/snapshot') return next()
        if (req.method !== 'GET') return sendError(res, 'method not allowed', 405)

        try {
          const [{ read, utils }, workbookBuffer] = await Promise.all([
            import('xlsx'),
            fetchBinary(GPR_DAILY_DATA_URL),
          ])

          const workbook = read(workbookBuffer, { type: 'buffer' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          if (!firstSheet) return sendError(res, 'Geopolitical risk workbook is empty.', 502)

          const rawRows = utils.sheet_to_json<Record<string, unknown>>(firstSheet, { raw: true })
          const series = rawRows
            .map((row) => {
              const date = parseCompactUtcDate(row.DAY)
              const value = toFiniteNumber(row.GPRD)
              const acts = toFiniteNumber(row.GPRD_ACT)
              const threats = toFiniteNumber(row.GPRD_THREAT)
              const movingAverage7 = toFiniteNumber(row.GPRD_MA7)
              const movingAverage30 = toFiniteNumber(row.GPRD_MA30)
              const articleCount = toFiniteNumber(row.N10D)

              if (
                !date ||
                value == null ||
                acts == null ||
                threats == null ||
                movingAverage7 == null ||
                movingAverage30 == null ||
                articleCount == null
              ) {
                return null
              }

              return {
                date,
                articleCount,
                value,
                acts,
                threats,
                movingAverage7,
                movingAverage30,
                event: typeof row.event === 'string' && row.event.trim() ? row.event.trim() : undefined,
              }
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)

          if (series.length === 0) return sendError(res, 'Geopolitical risk data is unavailable.', 502)

          const latest = series[series.length - 1]
          const previous = series.length > 1 ? series[series.length - 2] : null
          const recentSeries = series.slice(-Math.min(series.length, 366 * 5 + 16))
          const recentWeek = series.slice(-7)
          const change = previous ? latest.value - previous.value : null
          const changePct = previous && previous.value !== 0 ? (change! / previous.value) * 100 : null
          const weeklyHigh = recentWeek.length ? Math.max(...recentWeek.map((item) => item.value)) : null
          const weeklyLow = recentWeek.length ? Math.min(...recentWeek.map((item) => item.value)) : null

          return sendJSON(res, {
            latest,
            previous,
            change,
            changePct,
            weeklyHigh,
            weeklyLow,
            series: recentSeries,
            source: 'Caldara-Iacoviello Geopolitical Risk Index',
            sourceUrl: GPR_SOURCE_URL,
            dataUrl: GPR_DAILY_DATA_URL,
            license: 'CC BY 4.0',
            cadence: 'Official daily series, updated weekly on Mondays.',
            methodology: 'Recent daily GPR index (base 1985-2019 = 100), sourced from the official Caldara-Iacoviello dataset.',
            updatedAt: new Date().toISOString(),
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[vite-gpr]', msg)
          return sendError(res, msg)
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/api/polymarket/forecasts') return next()
        if (req.method !== 'GET') return sendError(res, 'method not allowed', 405)

        const limit = Math.max(1, Math.min(12, Number.parseInt(url.searchParams.get('limit') ?? '6', 10) || 6))
        const cacheKey = String(limit)
        const cached = polymarketForecastCache.get(cacheKey)
        if (cached && cached.expiresAt > Date.now()) {
          return sendJSON(res, cached.payload)
        }

        try {
          const upstreamParams = new URLSearchParams({
            active: 'true',
            closed: 'false',
            archived: 'false',
            limit: '120',
            order: 'volume24hr',
            ascending: 'false',
          })

          const response = await fetch(`${POLYMARKET_GAMMA_URL}/events?${upstreamParams.toString()}`, {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Charlie/1.0',
            },
          })

          const payload = await response.json().catch(() => null) as PolymarketEventResponse[] | { data?: PolymarketEventResponse[] } | null
          const events = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
              ? payload.data
              : []

          if (!response.ok) {
            throw new Error(`Polymarket forecast fetch failed (${response.status})`)
          }

          const body = {
            updatedAt: new Date().toISOString(),
            source: 'Polymarket Gamma API',
            forecasts: selectPolymarketForecasts(events, limit),
          }

          polymarketForecastCache.set(cacheKey, {
            expiresAt: Date.now() + 2 * 60_000,
            payload: body,
          })

          return sendJSON(res, body)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[vite-polymarket]', msg)
          return sendError(res, msg)
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname
        if (!path.startsWith('/api/gdelt/')) return next()

        try {
          if (req.method !== 'GET') return sendError(res, 'method not allowed', 405)

          const route = path.replace('/api/gdelt/', '')
          if (route !== 'geopolitics') {
            return sendError(res, `Unknown route: ${route}`, 404)
          }

          const timeframeHours = clampPositiveInteger(url.searchParams.get('timeframeHours'), 24, 720, 1)
          const limit = clampPositiveInteger(url.searchParams.get('limit'), 80, 240, 10)
          const gdeltTimespan = hoursToGdeltTimespan(timeframeHours)
          const liveHeadlineCutoff = Date.now() - timeframeHours * 60 * 60 * 1000
          const maxRecords = Math.max(limit, GDELT_MAX_HEADLINES)

          const articles = await getCachedGdeltArticles(
            'geopolitics',
            GDELT_GEOPOLITICS_QUERY,
            gdeltTimespan,
            maxRecords,
          )

          const seenKeys = new Set<string>()
          const payload = articles
            .map((article) => {
              const title = normalizeHeadlineText(article.title)
              const link = canonicalizeUrl(article.url)
              if (!title || !link) return null

              const seenAt = parseGdeltSeenDate(article.seendate)
              const publishedAt = seenAt ? Date.parse(seenAt) : 0
              if (!Number.isFinite(publishedAt) || publishedAt < liveHeadlineCutoff) return null

              const dedupeKey = `${title.toLowerCase().slice(0, 120)}|${link}`
              if (seenKeys.has(dedupeKey)) return null
              seenKeys.add(dedupeKey)

              const sourceCountry = typeof article.sourcecountry === 'string' && article.sourcecountry.trim()
                ? article.sourcecountry.trim()
                : null

              return {
                title,
                link,
                publisher: normalizeHeadlineText(article.domain) ?? 'GDELT',
                publishedAt,
                sourceCountry,
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((left, right) => right.publishedAt - left.publishedAt)
            .slice(0, limit)

          return sendJSON(res, payload)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[vite-gdelt-geopolitics]', msg)
          return sendError(res, msg)
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname

        if (path === '/api/connections/status') {
          if (req.method !== 'GET') return sendError(res, 'method not allowed', 405)

          try {
            const entries = await Promise.all(
              (Object.keys(CONNECTION_PROVIDER_CONFIG) as ConnectionProvider[]).map(async (provider) => [
                provider,
                Boolean(await readConnectionSecret(provider)),
              ] as const)
            )

            return sendJSON(res, Object.fromEntries(entries))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-connections-status]', msg)
            return sendError(res, msg)
          }
        }

        if (!path.startsWith('/api/connections/')) return next()

        const providerRaw = decodeURIComponent(path.replace('/api/connections/', '')).trim()
        if (!isConnectionProvider(providerRaw)) {
          return sendError(res, 'Unknown connection provider.', 404)
        }

        const provider = providerRaw

        try {
          if (req.method === 'PUT') {
            const rawBody = await readRequestBody(req)
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const secret = typeof payload.secret === 'string' ? payload.secret.trim() : ''
            if (!secret) return sendError(res, `${CONNECTION_PROVIDER_CONFIG[provider].requiredLabel} is required.`, 400)
            await writeConnectionSecret(provider, secret)
            return sendJSON(res, { configured: true })
          }

          if (req.method === 'DELETE') {
            await deleteConnectionSecret(provider)
            return sendJSON(res, { configured: false })
          }

          return sendError(res, 'method not allowed', 405)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[vite-connections]', msg)
          return sendError(res, msg)
        }
      })

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname

        if (path === '/api/openai/key-status') {
          if (req.method !== 'GET') return sendError(res, 'method not allowed', 405)

          try {
            const configured = Boolean(await readConnectionSecret('openai'))
            return sendJSON(res, { configured })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-key-status]', msg)
            return sendError(res, msg)
          }
        }

        if (path === '/api/openai/key') {
          try {
            if (req.method === 'PUT') {
              const rawBody = await readRequestBody(req)
              const payload = rawBody ? JSON.parse(rawBody) : {}
              const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
              if (!apiKey) return sendError(res, 'OpenAI API key is required.', 400)
              await writeConnectionSecret('openai', apiKey)
              return sendJSON(res, { configured: true })
            }

            if (req.method === 'DELETE') {
              await deleteConnectionSecret('openai')
              return sendJSON(res, { configured: false })
            }

            return sendError(res, 'method not allowed', 405)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-key]', msg)
            return sendError(res, msg)
          }
        }

        if (path === '/api/openai/panel-chat') {
          if (req.method !== 'POST') return sendError(res, 'method not allowed', 405)

          try {
            const rawBody = await readRequestBody(req)
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const model = typeof payload.model === 'string' ? payload.model.trim() : ''
            const activePanel = typeof payload.activePanel === 'string' ? payload.activePanel.trim() : ''
            const stream = Boolean(payload.stream)
            const panels = Array.isArray(payload.panels)
              ? Array.from(new Set(payload.panels.map((value: unknown) => String(value ?? '').trim()).filter(Boolean))).slice(0, 8)
              : []
            const messages = Array.isArray(payload.messages)
              ? payload.messages.flatMap((message) => {
                  if (!message || typeof message !== 'object') return []
                  const role = message.role === 'assistant' ? 'assistant' : 'user'
                  const content = typeof message.content === 'string' ? message.content.trim() : ''
                  if (!content) return []
                  return [{ role, content }]
                }).slice(-10)
              : []
            const contexts = Array.isArray(payload.contexts)
              ? payload.contexts.flatMap((context) => {
                  if (!context || typeof context !== 'object') return []
                  const panel = typeof context.panel === 'string' ? context.panel.trim() : ''
                  const title = typeof context.title === 'string' ? context.title.trim() : panel
                  const summary = typeof context.summary === 'string' ? context.summary.trim() : ''
                  const capturedAt = typeof context.capturedAt === 'string' ? context.capturedAt.trim() : ''
                  const source = typeof context.source === 'string' ? context.source.trim() : ''
                  const renderedText = typeof context.renderedText === 'string' ? context.renderedText.trim().slice(0, 12000) : ''
                  if (!panel) return []
                  return [{
                    panel,
                    title,
                    summary,
                    capturedAt,
                    source,
                    renderedText,
                    data: context.data ?? null,
                  }]
                }).slice(0, 10)
              : []

            const apiKey = await readConnectionSecret('openai')
            if (!apiKey) return sendError(res, 'OpenAI API key is not stored locally yet.', 400)
            if (!model) return sendError(res, 'OpenAI model is required.', 400)
            if (!activePanel) return sendError(res, 'Active panel is required.', 400)
            if (!messages.length) return sendError(res, 'At least one companion message is required.', 400)
            if (!contexts.length) return sendError(res, 'At least one panel context is required.', 400)

            const input = formatPanelCompanionInput({
              activePanel,
              panels: panels.length ? panels : contexts.map((context) => context.panel),
              messages,
              contexts,
            })

            if (stream) {
              const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model,
                  instructions: DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT,
                  input,
                  stream: true,
                }),
              })

              if (!openAIResponse.ok) {
                const responsePayload = await openAIResponse.json().catch(() => null)
                const message = responsePayload?.error?.message ?? `OpenAI request failed: ${openAIResponse.status}`
                return sendError(res, message, openAIResponse.status)
              }

              if (!openAIResponse.body) {
                return sendError(res, 'OpenAI streaming response body was empty.', 502)
              }

              res.statusCode = 200
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.setHeader('Cache-Control', 'no-cache, no-transform')
              res.setHeader('X-Accel-Buffering', 'no')

              const reader = openAIResponse.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              const flushBuffer = async (force = false) => {
                let separatorIndex = buffer.indexOf('\n\n')
                while (separatorIndex >= 0 || (force && buffer.trim())) {
                  const rawEvent = separatorIndex >= 0 ? buffer.slice(0, separatorIndex) : buffer
                  buffer = separatorIndex >= 0 ? buffer.slice(separatorIndex + 2) : ''
                  separatorIndex = buffer.indexOf('\n\n')

                  const dataLines = rawEvent
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trim())

                  if (!dataLines.length) continue
                  const data = dataLines.join('\n')
                  if (data === '[DONE]') continue

                  const parsed = parseOpenAIJsonText<any>(data)
                  if (!parsed) continue

                  const delta = extractOpenAIStreamDelta(parsed)
                  if (delta) {
                    res.write(delta)
                  }
                }
              }

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                await flushBuffer(false)
              }

              buffer += decoder.decode()
              await flushBuffer(true)
              res.end()
              return
            }

            const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                instructions: DEFAULT_PANEL_COMPANION_SYSTEM_PROMPT,
                input,
              }),
            })

            const responsePayload = await openAIResponse.json().catch(() => null)
            if (!openAIResponse.ok) {
              const message = responsePayload?.error?.message ?? `OpenAI request failed: ${openAIResponse.status}`
              return sendError(res, message, openAIResponse.status)
            }

            const answer = extractOpenAIText(responsePayload)
            if (!answer) return sendError(res, 'OpenAI returned an empty companion response.', 502)

            return sendJSON(res, {
              answer,
              generatedAt: new Date().toISOString(),
              model,
              panels: panels.length ? panels : contexts.map((context) => context.panel),
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-panel-chat]', msg)
            return sendError(res, msg)
          }
        }

        if (path === '/api/openai/geopolitical-events') {
          if (req.method !== 'POST') return sendError(res, 'method not allowed', 405)

          try {
            const rawBody = await readRequestBody(req)
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const model = typeof payload.model === 'string' ? payload.model.trim() : ''
            const systemPrompt = typeof payload.systemPrompt === 'string' && payload.systemPrompt.trim()
              ? payload.systemPrompt.trim()
              : DEFAULT_GEOPOLITICS_EVENT_SYSTEM_PROMPT
            const lookbackHours = Math.max(1, Math.min(24 * 7, Number.parseInt(String(payload.lookbackHours ?? '24'), 10) || 24))
            const headlines = Array.isArray(payload.headlines)
              ? payload.headlines
                  .flatMap((item) => {
                    if (!item || typeof item !== 'object') return []
                    const title = typeof item.title === 'string' ? item.title.trim() : ''
                    const link = typeof item.link === 'string' ? item.link.trim() : ''
                    if (!title || !link) return []
                    return [{
                      title,
                      link,
                    }]
                  })
                  .slice(0, 220)
              : []
            const supportedCountries = Array.isArray(payload.supportedCountries)
              ? payload.supportedCountries
                  .flatMap((item) => {
                    if (!item || typeof item !== 'object') return []
                    const code = typeof item.code === 'string' ? item.code.trim().toUpperCase() : ''
                    const label = typeof item.label === 'string' ? item.label.trim() : ''
                    if (!/^[A-Z]{2}$/.test(code) || !label) return []
                    return [{ code, label }]
                  })
              : []

            const apiKey = await readConnectionSecret('openai')
            if (!apiKey) return sendError(res, 'OpenAI API key is not stored locally yet.', 400)
            if (!model) return sendError(res, 'OpenAI model is required.', 400)
            if (!headlines.length) return sendError(res, 'At least one headline is required.', 400)
            if (!supportedCountries.length) return sendError(res, 'Supported country list is required.', 400)

            const countryCatalog = supportedCountries.map((country) => `${country.code}: ${country.label}`).join('\n')
            const input = [
              `Classify these mixed-feed headlines (Yahoo Finance and GDELT) for a geopolitical event map covering the last ${lookbackHours} hours.`,
              'Use only the headline title text to decide whether a country should be assigned.',
              'The link value is an opaque headline id for response matching, not a URL or source clue.',
              'Return strict JSON only in this exact shape:',
              '{"events":[{"link":"headline-1","locationLabel":"Country name","countryCodes":["US"],"severityScore":7,"eventKey":"2026-03-14-ir-missile-strike-tehran","eventLabel":"Missile strike in Tehran"}]}',
              'Rules:',
              '- Include headlines that describe concrete geopolitical events, hard state-security actions, military activity, sanctions actions, cross-border incidents, or credible breaking escalation updates tied to a real-world location.',
              '- Exclude pure opinion/commentary, purely financial market reaction headlines, company/earnings headlines, and headlines that are clearly not describing an underlying geopolitical event.',
              '- Always return a locationLabel. Return countryCodes using only the supported country list when the headline title maps the event location confidently.',
              '- Do not use publisher, article domain, source country, feed source, headline language, article language, or any other source metadata to choose countryCodes or locationLabel.',
              '- If the headline is likely geopolitical but the location is implicit, infer the most plausible country from the state actor or explicit context and keep severity low unless impact is clearly high.',
              '- You may assign up to 3 country codes to one headline when the headline clearly affects multiple countries.',
              '- severityScore must be an integer from 1 to 10 using these bins only: 1 to 2 = LOW, 3 to 5 = MEDIUM, 6 to 8 = HIGH, 9 to 10 = SEVERE.',
              '- Prefer lower severity bins when confidence is limited, but do not drop likely event-driven geopolitical headlines only because details are sparse.',
              '- Return eventLabel as a short neutral description of the underlying event.',
              '- Return eventKey as a stable lowercase slug for one specific incident only. Include date, place, and event type when possible.',
              '- Do not reuse the same eventKey for separate attacks, separate protests, separate sanctions announcements, or separate military incidents even if they happen in the same country on the same day.',
              '- Omit a headline only when it is clearly non-event-driven, clearly non-geopolitical, or impossible to map to a plausible location.',
              '',
              'Supported countries:',
              countryCatalog,
              '',
              'Headlines:',
              JSON.stringify(headlines, null, 2),
            ].join('\n')

            const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                instructions: systemPrompt,
                input,
              }),
            })

            const responsePayload = await openAIResponse.json().catch(() => null)
            if (!openAIResponse.ok) {
              const message = responsePayload?.error?.message ?? `OpenAI request failed: ${openAIResponse.status}`
              return sendError(res, message, openAIResponse.status)
            }

            const text = extractOpenAIText(responsePayload)
            if (!text) return sendError(res, 'OpenAI returned an empty classification payload.', 502)

            const parsed = parseOpenAIJsonText<{
              events?: Array<{
                link?: string
                locationLabel?: string
                countryCodes?: string[]
                severityScore?: number | string | null
                eventKey?: string
                eventLabel?: string
              }>
            }>(text)
            const events = Array.isArray(parsed?.events)
              ? parsed.events.flatMap((event) => {
                  const link = typeof event?.link === 'string' ? event.link.trim() : ''
                  if (!link) return []

                  const locationLabel = typeof event?.locationLabel === 'string' ? event.locationLabel.trim() : ''
                  const countryCodes = Array.isArray(event?.countryCodes)
                    ? Array.from(new Set(event.countryCodes
                        .map((value) => String(value ?? '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())
                        .filter((value) => /^[A-Z]{2}$/.test(value))))
                    : []
                  const severityRaw = typeof event?.severityScore === 'number'
                    ? event.severityScore
                    : Number.parseFloat(String(event?.severityScore ?? '0'))
                  const severityScore = !Number.isFinite(severityRaw) || severityRaw < 1
                    ? 0
                    : severityRaw > 10
                      ? Math.max(1, Math.min(10, Math.round(severityRaw / 10)))
                      : Math.max(1, Math.min(10, Math.round(severityRaw)))
                  const eventKey = typeof event?.eventKey === 'string' ? event.eventKey.trim() : ''
                  const eventLabel = typeof event?.eventLabel === 'string' ? event.eventLabel.trim() : ''

                  if ((!countryCodes.length && !locationLabel) || severityScore <= 0) return []

                  return [{ link, locationLabel, countryCodes, severityScore, eventKey, eventLabel }]
                })
              : null

            if (!events) {
              return sendError(res, 'OpenAI did not return valid JSON for geopolitical events.', 502)
            }

            return sendJSON(res, {
              events,
              generatedAt: new Date().toISOString(),
              model,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-geopolitics]', msg)
            return sendError(res, msg)
          }
        }

        if (path === '/api/openai/geopolitical-country-summaries') {
          if (req.method !== 'POST') return sendError(res, 'method not allowed', 405)

          try {
            const rawBody = await readRequestBody(req)
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const model = typeof payload.model === 'string' ? payload.model.trim() : ''
            const lookbackHours = Math.max(1, Math.min(24 * 7, Number.parseInt(String(payload.lookbackHours ?? '24'), 10) || 24))
            const countries = Array.isArray(payload.countries)
              ? payload.countries
                  .flatMap((item) => {
                    if (!item || typeof item !== 'object') return []

                    const key = typeof item.key === 'string' ? item.key.trim() : ''
                    const label = typeof item.label === 'string' ? item.label.trim() : ''
                    const countryCode = typeof item.countryCode === 'string' ? item.countryCode.trim().toUpperCase() : ''
                    const count = Number.parseInt(String(item.count ?? '0'), 10)
                    const severityRaw = typeof item.severityScore === 'number'
                      ? item.severityScore
                      : Number.parseFloat(String(item.severityScore ?? '0'))
                    const severityScore = Number.isFinite(severityRaw)
                      ? Math.max(1, Math.min(10, Math.round(severityRaw)))
                      : null
                    if (!key || !label || !/^[A-Z]{2}$/.test(countryCode) || !Number.isFinite(count) || count <= 0) return []

                    const stories = Array.isArray(item.stories)
                      ? item.stories
                          .flatMap((story) => {
                            if (!story || typeof story !== 'object') return []
                            const title = typeof story.title === 'string' ? story.title.trim() : ''
                            const publisher = typeof story.publisher === 'string' ? story.publisher.trim() : ''
                            const link = canonicalizeUrl(typeof story.link === 'string' ? story.link.trim() : '')
                            const publishedAt = typeof story.publishedAt === 'number'
                              ? story.publishedAt
                              : Number.parseInt(String(story.publishedAt ?? '0'), 10)
                            const feedSource = typeof story.feedSource === 'string'
                              ? story.feedSource.trim()
                              : ''
                            const eventLabel = typeof story.eventLabel === 'string' ? story.eventLabel.trim() : ''
                            if (!title || !link || !Number.isFinite(publishedAt) || publishedAt <= 0) return []
                            return [{
                              title,
                              publisher,
                              link,
                              publishedAt,
                              feedSource: feedSource || undefined,
                              eventLabel: eventLabel || undefined,
                            }]
                          })
                          .slice(0, 10)
                      : []

                    if (!stories.length) return []

                    return [{
                      key,
                      label,
                      countryCode,
                      count,
                      severityScore,
                      stories,
                    }]
                  })
                  .slice(0, 40)
              : []

            const apiKey = await readConnectionSecret('openai')
            if (!apiKey) return sendError(res, 'OpenAI API key is not stored locally yet.', 400)
            if (!model) return sendError(res, 'OpenAI model is required.', 400)
            if (!countries.length) return sendError(res, 'At least one country with stories is required.', 400)

            const input = [
              `Generate country hotspot summaries for the last ${lookbackHours} hours.`,
              'Return strict JSON only in this exact shape:',
              '{"summaries":[{"countryCode":"US","summary":"Short paragraph.","sourceLinks":["https://..."]}]}',
              'Rules:',
              '- Use only the provided stories/events for each country. Do not invent facts.',
              '- summary must be one short paragraph (1 to 3 sentences), neutral and concise.',
              '- Keep summary length compact (about 30 to 65 words) and similar in size across countries.',
              '- Do not mention counts of events/headlines or any severity/score numbers.',
              '- Avoid generic phrases like "developments remain event-driven". Describe the concrete events and what changed.',
              '- Include specific actors, locations, and actions from the provided story titles when available.',
              '- Mention the dominant event pattern and risk tone implied by the provided events.',
              '- sourceLinks must contain 2 to 6 links from the SAME country story list that directly support the summary.',
              '- sourceLinks should correspond to the exact stories whose headlines most directly support the summary text.',
              '- countryCode must match one of the provided country codes exactly.',
              '- Do not output markdown or additional keys.',
              '',
              'Country story bundles:',
              JSON.stringify(countries, null, 2),
            ].join('\n')

            const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                instructions: DEFAULT_GEOPOLITICS_COUNTRY_SUMMARY_SYSTEM_PROMPT,
                input,
              }),
            })

            const responsePayload = await openAIResponse.json().catch(() => null)
            if (!openAIResponse.ok) {
              const message = responsePayload?.error?.message ?? `OpenAI request failed: ${openAIResponse.status}`
              return sendError(res, message, openAIResponse.status)
            }

            const text = extractOpenAIText(responsePayload)
            if (!text) return sendError(res, 'OpenAI returned an empty country summary payload.', 502)

            const parsed = parseOpenAIJsonText<{
              summaries?: Array<{
                countryCode?: string
                summary?: string
                sourceLinks?: string[]
              }>
            }>(text)

            const allowedCountries = new Set(countries.map((country) => country.countryCode))
            const allowedLinksByCountry = new Map(
              countries.map((country) => [
                country.countryCode,
                new Set(
                  country.stories
                    .map((story) => canonicalizeUrl(story.link))
                    .filter((link): link is string => Boolean(link))
                ),
              ] as const)
            )

            const summaries = Array.isArray(parsed?.summaries)
              ? parsed.summaries.flatMap((item) => {
                  const countryCode = typeof item?.countryCode === 'string'
                    ? item.countryCode.trim().toUpperCase()
                    : ''
                  const summary = typeof item?.summary === 'string' ? item.summary.trim() : ''
                  if (!allowedCountries.has(countryCode) || !summary) return []

                  const allowedLinks = allowedLinksByCountry.get(countryCode) ?? new Set<string>()
                  const sourceLinks = Array.isArray(item?.sourceLinks)
                    ? Array.from(
                        new Set(
                          item.sourceLinks
                            .map((link) => canonicalizeUrl(String(link ?? '').trim()))
                            .filter((link): link is string => Boolean(link) && allowedLinks.has(link))
                        )
                      ).slice(0, 6)
                    : []

                  return [{ countryCode, summary, sourceLinks }]
                })
              : null

            if (!summaries) {
              return sendError(res, 'OpenAI did not return valid JSON for country summaries.', 502)
            }

            return sendJSON(res, {
              summaries,
              generatedAt: new Date().toISOString(),
              model,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-geopolitics-country-summaries]', msg)
            return sendError(res, msg)
          }
        }

        if (path === '/api/openai/discovery-themes') {
          if (req.method !== 'POST') return sendError(res, 'method not allowed', 405)

          try {
            const rawBody = await readRequestBody(req)
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const model = typeof payload.model === 'string' ? payload.model.trim() : ''
            const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt.trim() : ''
            const snapshot = payload.snapshot

            const apiKey = await readConnectionSecret('openai')
            if (!apiKey) return sendError(res, 'OpenAI API key is not stored locally yet.', 400)
            if (!model) return sendError(res, 'OpenAI model is required.', 400)
            if (!snapshot || typeof snapshot !== 'object') return sendError(res, 'Theme discovery snapshot is required.', 400)

            const rawSignals = Array.isArray((snapshot as any).signals)
              ? (snapshot as any).signals
                  .flatMap((item: any) => {
                    if (!item || typeof item !== 'object') return []
                    const id = typeof item.id === 'string' ? item.id.trim() : ''
                    const type = typeof item.type === 'string' ? item.type.trim() : ''
                    const sourceLabel = typeof item.sourceLabel === 'string' ? item.sourceLabel.trim() : ''
                    const title = typeof item.title === 'string' ? item.title.trim() : ''
                    const detail = typeof item.detail === 'string' ? item.detail.trim() : ''
                    const timestamp = typeof item.timestamp === 'number'
                      ? item.timestamp
                      : Number.parseInt(String(item.timestamp ?? '0'), 10)
                    if (!id || !type || !title || !Number.isFinite(timestamp) || timestamp <= 0) return []
                    const assets = Array.isArray(item.assets)
                      ? Array.from(new Set(item.assets.map((value: unknown) => String(value ?? '').trim().toUpperCase()).filter(Boolean))).slice(0, 8)
                      : []
                    const countries = Array.isArray(item.countries)
                      ? Array.from(new Set(item.countries.map((value: unknown) => String(value ?? '').trim().toUpperCase()).filter(Boolean))).slice(0, 6)
                      : []
                    const keywords = Array.isArray(item.keywords)
                      ? Array.from(new Set(item.keywords.map((value: unknown) => String(value ?? '').trim()).filter(Boolean))).slice(0, 8)
                      : []

                    return [{ id, type, sourceLabel, title, detail, timestamp, assets, countries, keywords }]
                  })
                  .slice(0, 90)
              : []

            const portfolio = Array.isArray((snapshot as any).portfolio?.holdings)
              ? (snapshot as any).portfolio.holdings
                  .flatMap((item: any) => {
                    if (!item || typeof item !== 'object') return []
                    const symbol = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : ''
                    const label = typeof item.label === 'string' ? item.label.trim() : symbol
                    const currentValue = typeof item.currentValue === 'number'
                      ? item.currentValue
                      : Number.parseFloat(String(item.currentValue ?? '0'))
                    const weightPct = typeof item.weightPct === 'number'
                      ? item.weightPct
                      : Number.parseFloat(String(item.weightPct ?? '0'))
                    if (!symbol) return []
                    return [{ symbol, label, currentValue: Number.isFinite(currentValue) ? currentValue : 0, weightPct: Number.isFinite(weightPct) ? weightPct : 0 }]
                  })
                  .slice(0, 15)
              : []

            const watchlist = Array.isArray((snapshot as any).watchlist)
              ? Array.from(new Set((snapshot as any).watchlist.map((value: unknown) => String(value ?? '').trim().toUpperCase()).filter(Boolean))).slice(0, 25)
              : []

            if (!rawSignals.length) return sendError(res, 'At least one normalized signal is required.', 400)

            const signalIds = new Set(rawSignals.map((signal) => signal.id))
            const firstInput = [
              'Identify the most decision-useful investable themes from this multi-source market signal snapshot.',
              'The themes must emerge from the signals themselves, not from a fixed theme list.',
              'Return strict JSON only in this exact shape:',
              '{"themes":[{"id":"theme-1","label":"Theme label","summary":"One-sentence summary.","thesis":"Short thesis.","signalIds":["..."],"linkedAssets":["NVDA"],"confidence":78,"importance":81}]}',
              'Rules:',
              '- Return 3 to 5 themes only.',
              '- Every theme must be supported by at least 2 signalIds from the provided signal list unless the evidence is unusually strong and market-relevant.',
              '- label should be concise and human-readable.',
              '- summary should explain what is happening now.',
              '- thesis should explain the market interpretation in plain English.',
              '- linkedAssets should be liquid symbols that best express the theme.',
              '- confidence and importance must be integers from 0 to 100.',
              '- Exclude weak, duplicate, or purely descriptive clusters that are not useful for an investor.',
              '',
              JSON.stringify({
                generatedAt: (snapshot as any).generatedAt ?? new Date().toISOString(),
                signals: rawSignals,
                portfolio,
                watchlist,
              }, null, 2),
            ].join('\n')

            const firstPass = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                instructions: [DEFAULT_THEME_DISCOVERY_SYSTEM_PROMPT, systemPrompt].filter(Boolean).join('\n\n'),
                input: firstInput,
              }),
            })

            const firstPayload = await firstPass.json().catch(() => null)
            if (!firstPass.ok) {
              const message = firstPayload?.error?.message ?? `OpenAI request failed: ${firstPass.status}`
              return sendError(res, message, firstPass.status)
            }

            const firstText = extractOpenAIText(firstPayload)
            if (!firstText) return sendError(res, 'OpenAI returned an empty theme discovery payload.', 502)

            const firstParsed = parseOpenAIJsonText<{ themes?: Array<any> }>(firstText)
            const firstThemes = Array.isArray(firstParsed?.themes)
              ? firstParsed.themes.flatMap((theme, index) => {
                  const label = typeof theme?.label === 'string' ? theme.label.trim() : ''
                  const summary = typeof theme?.summary === 'string' ? theme.summary.trim() : ''
                  const thesis = typeof theme?.thesis === 'string' ? theme.thesis.trim() : ''
                  const id = typeof theme?.id === 'string' && theme.id.trim() ? theme.id.trim() : `theme-${index + 1}`
                  const signalRefs = Array.isArray(theme?.signalIds)
                    ? Array.from(new Set(theme.signalIds.map((value: unknown) => String(value ?? '').trim()).filter((value: string) => signalIds.has(value))))
                    : []
                  const linkedAssets = Array.isArray(theme?.linkedAssets)
                    ? Array.from(new Set(theme.linkedAssets.map((value: unknown) => String(value ?? '').trim().toUpperCase()).filter(Boolean))).slice(0, 8)
                    : []
                  const confidenceRaw = typeof theme?.confidence === 'number' ? theme.confidence : Number.parseInt(String(theme?.confidence ?? '0'), 10)
                  const importanceRaw = typeof theme?.importance === 'number' ? theme.importance : Number.parseInt(String(theme?.importance ?? '0'), 10)
                  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(100, Math.round(confidenceRaw))) : 0
                  const importance = Number.isFinite(importanceRaw) ? Math.max(0, Math.min(100, Math.round(importanceRaw))) : 0

                  if (!label || !summary || !thesis || signalRefs.length === 0) return []

                  return [{ id, label, summary, thesis, signalIds: signalRefs, linkedAssets, confidence, importance }]
                }).slice(0, 5)
              : []

            if (!firstThemes.length) {
              return sendError(res, 'OpenAI did not return valid investable themes.', 502)
            }

            const secondInput = [
              'Write actionable guidance for these discovered themes.',
              'Return strict JSON only in this exact shape:',
              '{"themes":[{"id":"theme-1","whyItMatters":"...","actionSummary":"...","portfolioAngle":"...","watchlistAngle":"...","opportunityAngle":"...","primaryRecommendation":"...","playbook":["..."],"catalysts":["..."],"watchItems":["..."],"invalidationSignals":["..."]}]}',
              'Rules:',
              '- Be concrete and investor-oriented, but do not give personalized investment advice or guarantee outcomes.',
              '- portfolioAngle should explain the implication for actual current holdings only.',
              '- watchlistAngle should explain the implication for names already tracked but not yet owned.',
              '- opportunityAngle should explain the implication for fresh ideas outside portfolio and watchlist.',
              '- primaryRecommendation should be one clear next move.',
              '- playbook should contain 2 to 4 concise next steps.',
              '- catalysts, watchItems, and invalidationSignals should each contain 1 to 4 concise items.',
              '- Use only the evidence inside each theme bundle.',
              '',
              JSON.stringify({
                portfolio,
                watchlist,
                themes: firstThemes.map((theme) => ({
                  ...theme,
                  signals: rawSignals
                    .filter((signal) => theme.signalIds.includes(signal.id))
                    .map((signal) => ({
                      id: signal.id,
                      type: signal.type,
                      sourceLabel: signal.sourceLabel,
                      title: signal.title,
                      detail: signal.detail,
                      timestamp: signal.timestamp,
                      assets: signal.assets,
                      countries: signal.countries,
                    })),
                })),
              }, null, 2),
            ].join('\n')

            const secondPass = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                instructions: [DEFAULT_THEME_DISCOVERY_RECOMMENDATION_SYSTEM_PROMPT, systemPrompt].filter(Boolean).join('\n\n'),
                input: secondInput,
              }),
            })

            const secondPayload = await secondPass.json().catch(() => null)
            if (!secondPass.ok) {
              const message = secondPayload?.error?.message ?? `OpenAI request failed: ${secondPass.status}`
              return sendError(res, message, secondPass.status)
            }

            const secondText = extractOpenAIText(secondPayload)
            if (!secondText) return sendError(res, 'OpenAI returned an empty recommendation payload.', 502)

            const secondParsed = parseOpenAIJsonText<{ themes?: Array<any> }>(secondText)
            const guidanceMap = new Map(
              Array.isArray(secondParsed?.themes)
                ? secondParsed.themes.flatMap((theme) => {
                    const id = typeof theme?.id === 'string' ? theme.id.trim() : ''
                    if (!id) return []
                    const getText = (value: unknown) => typeof value === 'string' ? value.trim() : ''
                    const toList = (value: unknown) => Array.isArray(value)
                      ? Array.from(new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))).slice(0, 4)
                      : []

                    return [[id, {
                      whyItMatters: getText(theme?.whyItMatters),
                      actionSummary: getText(theme?.actionSummary),
                      portfolioAngle: getText(theme?.portfolioAngle),
                      watchlistAngle: getText(theme?.watchlistAngle),
                      opportunityAngle: getText(theme?.opportunityAngle),
                      primaryRecommendation: getText(theme?.primaryRecommendation),
                      playbook: toList(theme?.playbook),
                      catalysts: toList(theme?.catalysts),
                      watchItems: toList(theme?.watchItems),
                      invalidationSignals: toList(theme?.invalidationSignals),
                    }] as const]
                  })
                : []
            )

            const themes = firstThemes.map((theme) => {
              const guidance = guidanceMap.get(theme.id)
              return {
                ...theme,
                whyItMatters: guidance?.whyItMatters || theme.summary,
                actionSummary: guidance?.actionSummary || theme.thesis,
                portfolioAngle: guidance?.portfolioAngle || '',
                watchlistAngle: guidance?.watchlistAngle || '',
                opportunityAngle: guidance?.opportunityAngle || '',
                primaryRecommendation: guidance?.primaryRecommendation || theme.thesis,
                playbook: guidance?.playbook ?? [],
                catalysts: guidance?.catalysts ?? [],
                watchItems: guidance?.watchItems ?? [],
                invalidationSignals: guidance?.invalidationSignals ?? [],
              }
            })

            return sendJSON(res, {
              generatedAt: new Date().toISOString(),
              model,
              themes,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-discovery-themes]', msg)
            return sendError(res, msg)
          }
        }

        if (path === '/api/openai/topic-theme-guidance') {
          if (req.method !== 'POST') return sendError(res, 'method not allowed', 405)

          try {
            const rawBody = await readRequestBody(req)
            const payload = rawBody ? JSON.parse(rawBody) : {}
            const model = typeof payload.model === 'string' ? payload.model.trim() : ''
            const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt.trim() : ''
            const snapshot = payload.snapshot

            const apiKey = await readConnectionSecret('openai')
            if (!apiKey) return sendError(res, 'OpenAI API key is not stored locally yet.', 400)
            if (!model) return sendError(res, 'OpenAI model is required.', 400)
            if (!snapshot || typeof snapshot !== 'object') return sendError(res, 'Topic theme guidance snapshot is required.', 400)

            const requestedTopics = Array.isArray((snapshot as any).requestedTopics)
              ? Array.from(new Set((snapshot as any).requestedTopics.map((value: unknown) => String(value ?? '').trim()).filter(Boolean))).slice(0, 8)
              : []

            const portfolio = Array.isArray((snapshot as any).portfolio?.holdings)
              ? (snapshot as any).portfolio.holdings
                  .flatMap((item: any) => {
                    if (!item || typeof item !== 'object') return []
                    const symbol = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : ''
                    const label = typeof item.label === 'string' ? item.label.trim() : symbol
                    const currentValue = typeof item.currentValue === 'number'
                      ? item.currentValue
                      : Number.parseFloat(String(item.currentValue ?? '0'))
                    const weightPct = typeof item.weightPct === 'number'
                      ? item.weightPct
                      : Number.parseFloat(String(item.weightPct ?? '0'))
                    if (!symbol) return []
                    return [{ symbol, label, currentValue: Number.isFinite(currentValue) ? currentValue : 0, weightPct: Number.isFinite(weightPct) ? weightPct : 0 }]
                  })
                  .slice(0, 15)
              : []

            const watchlist = Array.isArray((snapshot as any).watchlist)
              ? Array.from(new Set((snapshot as any).watchlist.map((value: unknown) => String(value ?? '').trim().toUpperCase()).filter(Boolean))).slice(0, 25)
              : []

            const rawThemes = Array.isArray((snapshot as any).themes)
              ? (snapshot as any).themes.flatMap((theme: any) => {
                  if (!theme || typeof theme !== 'object') return []
                  const id = typeof theme.id === 'string' ? theme.id.trim() : ''
                  const label = typeof theme.label === 'string' ? theme.label.trim() : ''
                  const summary = typeof theme.summary === 'string' ? theme.summary.trim() : ''
                  const thesis = typeof theme.thesis === 'string' ? theme.thesis.trim() : ''
                  const score = typeof theme.score === 'number' ? theme.score : Number.parseInt(String(theme.score ?? '0'), 10)
                  const signalCount = typeof theme.signalCount === 'number' ? theme.signalCount : Number.parseInt(String(theme.signalCount ?? '0'), 10)
                  if (!id || !label) return []

                  const sourceMix = Array.isArray(theme.sourceMix)
                    ? theme.sourceMix.flatMap((item: any) => {
                        const source = typeof item?.source === 'string' ? item.source.trim() : ''
                        const count = typeof item?.count === 'number' ? item.count : Number.parseInt(String(item?.count ?? '0'), 10)
                        if (!source || !Number.isFinite(count)) return []
                        return [{ source, count }]
                      }).slice(0, 8)
                    : []
                  const keywords = Array.isArray(theme.keywords)
                    ? Array.from(new Set(theme.keywords.map((value: unknown) => String(value ?? '').trim()).filter(Boolean))).slice(0, 8)
                    : []
                  const linkedAssets = Array.isArray(theme.linkedAssets)
                    ? Array.from(new Set(theme.linkedAssets.map((value: unknown) => String(value ?? '').trim().toUpperCase()).filter(Boolean))).slice(0, 8)
                    : []
                  const toList = (value: unknown, limit = 4) => Array.isArray(value)
                    ? Array.from(new Set(value.map((entry: unknown) => String(entry ?? '').trim()).filter(Boolean))).slice(0, limit)
                    : []
                  const evidence = Array.isArray(theme.evidence)
                    ? theme.evidence.flatMap((item: any) => {
                        const evidenceId = typeof item?.id === 'string' ? item.id.trim() : ''
                        const type = typeof item?.type === 'string' ? item.type.trim() : ''
                        const title = typeof item?.title === 'string' ? item.title.trim() : ''
                        const detail = typeof item?.detail === 'string' ? item.detail.trim() : ''
                        const sourceLabel = typeof item?.sourceLabel === 'string' ? item.sourceLabel.trim() : ''
                        const timestamp = typeof item?.timestamp === 'number' ? item.timestamp : Number.parseInt(String(item?.timestamp ?? '0'), 10)
                        if (!evidenceId || !title) return []
                        return [{ id: evidenceId, type, title, detail, sourceLabel, timestamp: Number.isFinite(timestamp) ? timestamp : 0 }]
                      }).slice(0, 6)
                    : []

                  const portfolioImpact = {
                    label: typeof theme.portfolioImpact?.label === 'string' ? theme.portfolioImpact.label.trim() : '',
                    holdings: Array.isArray(theme.portfolioImpact?.holdings)
                      ? theme.portfolioImpact.holdings.flatMap((item: any) => {
                          const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : ''
                          const label = typeof item?.label === 'string' ? item.label.trim() : symbol
                          const currentValue = typeof item?.currentValue === 'number' ? item.currentValue : Number.parseFloat(String(item?.currentValue ?? '0'))
                          const weightPct = typeof item?.weightPct === 'number' ? item.weightPct : Number.parseFloat(String(item?.weightPct ?? '0'))
                          if (!symbol) return []
                          return [{ symbol, label, currentValue: Number.isFinite(currentValue) ? currentValue : 0, weightPct: Number.isFinite(weightPct) ? weightPct : 0 }]
                        }).slice(0, 8)
                      : [],
                    portfolioWeightPct: typeof theme.portfolioImpact?.portfolioWeightPct === 'number'
                      ? theme.portfolioImpact.portfolioWeightPct
                      : Number.parseFloat(String(theme.portfolioImpact?.portfolioWeightPct ?? '0')),
                    watchlistOverlap: toList(theme.portfolioImpact?.watchlistOverlap),
                    externalIdeas: toList(theme.portfolioImpact?.externalIdeas),
                    portfolioRecommendation: typeof theme.portfolioImpact?.portfolioRecommendation === 'string' ? theme.portfolioImpact.portfolioRecommendation.trim() : '',
                    watchlistRecommendation: typeof theme.portfolioImpact?.watchlistRecommendation === 'string' ? theme.portfolioImpact.watchlistRecommendation.trim() : '',
                    opportunityRecommendation: typeof theme.portfolioImpact?.opportunityRecommendation === 'string' ? theme.portfolioImpact.opportunityRecommendation.trim() : '',
                  }

                  return [{
                    id,
                    label,
                    summary,
                    thesis,
                    score: Number.isFinite(score) ? score : 0,
                    signalCount: Number.isFinite(signalCount) ? signalCount : 0,
                    sourceMix,
                    keywords,
                    linkedAssets,
                    catalysts: toList(theme.catalysts),
                    watchItems: toList(theme.watchItems),
                    invalidationSignals: toList(theme.invalidationSignals),
                    evidence,
                    portfolioImpact,
                  }]
                }).slice(0, 8)
              : []

            if (!rawThemes.length) return sendError(res, 'At least one theme bundle is required.', 400)

            const input = [
              'Write grounded content and recommendations for these preselected market themes.',
              'The theme labels are fixed because they come from topics chosen by the user.',
              'Do not merge, rename, drop, or invent themes.',
              'Return strict JSON only in this exact shape:',
              '{"themes":[{"id":"theme-1","summary":"...","thesis":"...","whyItMatters":"...","actionSummary":"...","portfolioAngle":"...","watchlistAngle":"...","opportunityAngle":"...","primaryRecommendation":"...","playbook":["..."],"catalysts":["..."],"watchItems":["..."],"invalidationSignals":["..."]}]}',
              'Rules:',
              '- Keep each theme aligned to its existing label and evidence bundle.',
              '- summary should explain what is happening now for that chosen topic.',
              '- thesis should interpret the market meaning in plain English.',
              '- portfolioAngle should discuss actual current holdings only.',
              '- watchlistAngle should discuss names already tracked but not currently owned.',
              '- opportunityAngle should discuss fresh ideas outside portfolio and watchlist.',
              '- primaryRecommendation should be one clear next move.',
              '- playbook should contain 2 to 4 concise next steps.',
              '- catalysts, watchItems, and invalidationSignals should each contain 1 to 4 concise items.',
              '- Use only the supplied evidence and exposure context.',
              '',
              JSON.stringify({
                generatedAt: (snapshot as any).generatedAt ?? new Date().toISOString(),
                requestedTopics,
                portfolio,
                watchlist,
                themes: rawThemes,
              }, null, 2),
            ].join('\n')

            const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                instructions: [DEFAULT_TOPIC_THEME_GUIDANCE_SYSTEM_PROMPT, DEFAULT_THEME_DISCOVERY_RECOMMENDATION_SYSTEM_PROMPT, systemPrompt].filter(Boolean).join('\n\n'),
                input,
              }),
            })

            const responsePayload = await openAIResponse.json().catch(() => null)
            if (!openAIResponse.ok) {
              const message = responsePayload?.error?.message ?? `OpenAI request failed: ${openAIResponse.status}`
              return sendError(res, message, openAIResponse.status)
            }

            const responseText = extractOpenAIText(responsePayload)
            if (!responseText) return sendError(res, 'OpenAI returned an empty topic guidance payload.', 502)

            const parsed = parseOpenAIJsonText<{ themes?: Array<any> }>(responseText)
            const themes = Array.isArray(parsed?.themes)
              ? parsed.themes.flatMap((theme) => {
                  const id = typeof theme?.id === 'string' ? theme.id.trim() : ''
                  if (!id || !rawThemes.some((candidate) => candidate.id === id)) return []
                  const getText = (value: unknown) => typeof value === 'string' ? value.trim() : ''
                  const toList = (value: unknown) => Array.isArray(value)
                    ? Array.from(new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))).slice(0, 4)
                    : []

                  return [{
                    id,
                    summary: getText(theme?.summary),
                    thesis: getText(theme?.thesis),
                    whyItMatters: getText(theme?.whyItMatters),
                    actionSummary: getText(theme?.actionSummary),
                    portfolioAngle: getText(theme?.portfolioAngle),
                    watchlistAngle: getText(theme?.watchlistAngle),
                    opportunityAngle: getText(theme?.opportunityAngle),
                    primaryRecommendation: getText(theme?.primaryRecommendation),
                    playbook: toList(theme?.playbook),
                    catalysts: toList(theme?.catalysts),
                    watchItems: toList(theme?.watchItems),
                    invalidationSignals: toList(theme?.invalidationSignals),
                  }]
                })
              : []

            if (!themes.length) return sendError(res, 'OpenAI did not return valid topic guidance.', 502)

            return sendJSON(res, {
              generatedAt: new Date().toISOString(),
              model,
              themes,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[vite-openai-topic-theme-guidance]', msg)
            return sendError(res, msg)
          }
        }

        if (path !== '/api/openai/overview-summary') return next()

        if (req.method !== 'POST') return sendError(res, 'method not allowed', 405)

        try {
          const rawBody = await readRequestBody(req)
          const payload = rawBody ? JSON.parse(rawBody) : {}
          const model = typeof payload.model === 'string' ? payload.model.trim() : ''
          const harness = payload.harness === 'custom' ? 'custom' : 'comprehensive'
          const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt.trim() : ''
          const snapshot = payload.snapshot

          const apiKey = await readConnectionSecret('openai')
          if (!apiKey) return sendError(res, 'OpenAI API key is not stored locally yet.', 400)
          if (!model) return sendError(res, 'OpenAI model is required.', 400)
          if (!snapshot || typeof snapshot !== 'object') return sendError(res, 'Overview snapshot is required.', 400)

          const instructions = [DEFAULT_OVERVIEW_SUMMARY_SYSTEM_PROMPT, systemPrompt]
            .filter(Boolean)
            .join('\n\n')

          const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              instructions,
              input: `Summarize this market overview snapshot for a professional terminal user using only the provided snapshot data.\n\n${JSON.stringify(snapshot, null, 2)}`,
            }),
          })

          const responsePayload = await openAIResponse.json().catch(() => null)
          if (!openAIResponse.ok) {
            const message = responsePayload?.error?.message ?? `OpenAI request failed: ${openAIResponse.status}`
            return sendError(res, message, openAIResponse.status)
          }

          const summary = extractOpenAIText(responsePayload)
          if (!summary) return sendError(res, 'OpenAI returned an empty summary.', 502)

          return sendJSON(res, {
            summary,
            generatedAt: new Date().toISOString(),
            model,
            harness,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[vite-openai]', msg)
          return sendError(res, msg)
        }
      })

      // CoinGecko proxy
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/coingecko/')) return next()

        const target = 'https://api.coingecko.com' + url.pathname.replace('/api/coingecko', '') + url.search
        try {
          const { default: https } = await import('node:https')
          await new Promise<void>((resolve, reject) => {
            const proxyReq = https.get(
              target,
              { headers: { 'User-Agent': 'Charlie/1.0', Accept: 'application/json' } },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (proxyRes: any) => {
                res.writeHead(proxyRes.statusCode ?? 200, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                })
                proxyRes.pipe(res)
                proxyRes.on('end', resolve)
              }
            )
            proxyReq.on('error', reject)
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          sendError(res, msg)
        }
      })

      // Finnhub proxy — earnings & economic calendar
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/finnhub/')) return next()

        const apiKey = await readConnectionSecret('finnhub') ?? ''
        if (!apiKey) return sendError(res, 'Finnhub is not configured on this device yet. Add your key in Connections.', 503)

        const fhPath = url.pathname.replace('/api/finnhub', '')
        url.searchParams.set('token', apiKey)
        const target = `https://finnhub.io/api/v1${fhPath}?${url.searchParams.toString()}`

        try {
          const { default: https } = await import('node:https')
          await new Promise<void>((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const proxyReq = https.get(target, { headers: { 'User-Agent': 'Charlie/1.0', Accept: 'application/json' } }, (proxyRes: any) => {
              res.writeHead(proxyRes.statusCode ?? 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
              proxyRes.pipe(res)
              proxyRes.on('end', resolve)
            })
            proxyReq.on('error', reject)
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          sendError(res, msg)
        }
      })

      // FRED proxy - live macro series, release calendar, and metadata
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/fred/')) return next()

        const apiKey = await readConnectionSecret('fred') ?? ''
        if (!apiKey) return sendError(res, 'FRED is not configured on this device yet. Add your key in Connections.', 503)

        const fredPath = url.pathname.replace('/api/fred', '')
        url.searchParams.set('api_key', apiKey)
        url.searchParams.set('file_type', 'json')
        const target = `https://api.stlouisfed.org/fred${fredPath}?${url.searchParams.toString()}`

        try {
          const { default: https } = await import('node:https')
          await new Promise<void>((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const proxyReq = https.get(target, { headers: { 'User-Agent': 'Charlie/1.0', Accept: 'application/json' } }, (proxyRes: any) => {
              res.writeHead(proxyRes.statusCode ?? 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
              proxyRes.pipe(res)
              proxyRes.on('end', resolve)
            })
            proxyReq.on('error', reject)
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          sendError(res, msg)
        }
      })
  }

  return {
    name: 'vite-plugin-yahoo-finance',
    configureServer(server: ViteDevServer) {
      registerMarketDataMiddlewares(server)
    },
    configurePreviewServer(server: PreviewServer) {
      registerMarketDataMiddlewares(server)
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), marketDataMiddleware()],
}))

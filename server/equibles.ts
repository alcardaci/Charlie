import { EARNINGS_TRANSCRIPT_PAGE_SIZE } from '../src/types/earningsCalls'
import type {
  EarningsCallBriefPage, EarningsCallCorrection, EarningsCallEvent, EarningsCallGuidanceItem, EarningsCallGuidancePage,
  EarningsCallInsightsPage, EarningsCallListPage, EarningsCallMaterial, EarningsCallPhraseTrend, EarningsCallQuestionsPage,
  EarningsCallThemeHistory, EarningsCallTranscriptPage, EarningsFiscalPeriod,
} from '../src/types/earningsCalls'

type Page = EarningsCallListPage | EarningsCallTranscriptPage | EarningsCallBriefPage | EarningsCallInsightsPage
  | EarningsCallQuestionsPage | EarningsCallThemeHistory | EarningsCallPhraseTrend | EarningsCallGuidancePage
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const API_ROOT = 'https://api.equibles.com/v1/'
const EVENT_ID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
const EXCHANGE_SUFFIXES: Record<string, string> = {
  L: 'XLON', DE: 'XETR', AS: 'XAMS', PA: 'XPAR', MI: 'XMIL', T: 'XTKS', HK: 'XHKG',
  SS: 'XSHG', SZ: 'XSHE', BR: 'XBRU', LS: 'XLIS', MC: 'XMAD', SW: 'XSWX', TO: 'XTSE',
  V: 'XTSX', AX: 'XASX', NZ: 'XNZE', ST: 'XSTO', OL: 'XOSL', CO: 'XCSE', HE: 'XHEL',
}

export class EquiblesError extends Error {
  constructor(public status: number, message: string, public retryAt?: number) { super(message) }
}

function listing(value: string) {
  const ticker = value.trim().toUpperCase()
  if (/^[A-Z\d]{4}:[A-Z\d][A-Z\d.-]{0,19}$/.test(ticker) || /^[A-Z\d][A-Z\d-]{0,19}$/.test(ticker)) return ticker
  const suffix = /^([A-Z\d][A-Z\d-]{0,19})\.([A-Z]{1,3})$/.exec(ticker)
  if (suffix && Object.hasOwn(EXCHANGE_SUFFIXES, suffix[2])) return EXCHANGE_SUFFIXES[suffix[2]] + ':' + suffix[1]
  throw new EquiblesError(422, 'Equibles does not recognize this listing format.')
}

function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null }
function integer(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null }
function seconds(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null }
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function material(value: unknown): EarningsCallMaterial | null {
  if (!value || typeof value !== 'object') return null
  const row = record(value)
  return { status: text(row.status), reason: text(row.reason), nextAttemptAt: text(row.nextAttemptAt) }
}

function webcast(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function event(row: Record<string, unknown>, ticker: string, providerTicker: string): EarningsCallEvent | null {
  const id = text(row.id)
  if (!id || !EVENT_ID.test(id) || row.eventType !== 'EarningsCall') return null
  const year = integer(row.fiscalYear)
  const quarter = integer(row.fiscalQuarter)
  const fiscalYear = year !== null && year >= 1900 && year <= 9999 ? year : null
  const fiscalQuarter = quarter !== null && quarter >= 1 && quarter <= 4 ? quarter : null
  const materials = record(row.materials)
  const hasAudio = row.hasAudio === true
  const hasSlides = row.hasSlides === true
  const symbolPath = providerTicker.toLowerCase().split(':').map(encodeURIComponent).join('/')
  const callUrl = fiscalYear && fiscalQuarter ? `https://equibles.com/stocks/${symbolPath}/calls/${fiscalYear}-q${fiscalQuarter}` : null
  return {
    id, ticker, title: text(row.title), fiscalYear, fiscalQuarter, status: text(row.status), statusName: text(row.statusName),
    callDate: text(row.callDate), callDateIsPeriodEnd: row.callDateIsPeriodEnd === true,
    hasTranscript: row.hasTranscript === true, hasAudio, hasSlides,
    presentationOnly: row.presentationOnly === true, partialRecording: row.partialRecording === true,
    webcastUrl: webcast(row.webcastUrl),
    replayUrl: hasAudio ? callUrl : null,
    slidesUrl: hasSlides && callUrl ? callUrl + '/slides' : null,
    materials: { transcript: material(materials.transcript), audio: material(materials.audio), slides: material(materials.slides) },
  }
}

function invalidResponse(): never {
  throw new EquiblesError(502, 'Equibles returned an incomplete response. Please try again later.')
}

function listPage(payload: Record<string, unknown>, offset: number, symbols: Map<string, string>, fallbackTicker?: string): EarningsCallListPage {
  if (!Array.isArray(payload.data)) return invalidResponse()
  const meta = record(payload.meta)
  if (meta.offset !== undefined && meta.offset !== offset) return invalidResponse()
  const data: EarningsCallEvent[] = []
  for (const value of payload.data) {
    const row = record(value)
    const providerTicker = text(row.ticker)?.toUpperCase() ?? fallbackTicker
    const ticker = providerTicker && symbols.get(providerTicker)
    if (!ticker || !providerTicker) continue
    const item = event(row, ticker, providerTicker)
    if (item) data.push(item)
  }
  const count = payload.data.length
  if (!count && meta.hasMore === true) return invalidResponse()
  return { data, meta: { limit: integer(meta.limit) ?? 100, offset, count, hasMore: meta.hasMore === true } }
}

function transcriptPage(payload: Record<string, unknown>, offset: number, eventId: string): EarningsCallTranscriptPage {
  if (!Array.isArray(payload.data) || text(payload.eventId)?.toLowerCase() !== eventId ||
      (payload.offset !== undefined && payload.offset !== offset)) return invalidResponse()
  const turnCount = payload.data.length
  if (!turnCount && payload.hasMore === true) return invalidResponse()
  return {
    eventId, ticker: text(payload.ticker), eventTitle: text(payload.eventTitle), callDate: text(payload.callDate),
    fiscalYear: integer(payload.fiscalYear), fiscalQuarter: integer(payload.fiscalQuarter),
    offset, turnCount, totalTurnCount: integer(payload.totalTurnCount), hasMore: payload.hasMore === true,
    isFiledRecord: payload.isFiledRecord === true, hasSpeakerLabels: payload.hasSpeakerLabels !== false,
    data: payload.data.flatMap((value, index) => {
      const row = record(value), words = text(row.text)
      return words ? [{ turnIndex: offset + index, text: words, speakerIndex: integer(row.speakerIndex), speakerName: text(row.speakerName),
        speakerRole: text(row.speakerRole), startSeconds: seconds(row.startSeconds), endSeconds: seconds(row.endSeconds) }] : []
    }),
    corrections: corrections(payload.corrections),
  }
}

type Row = Record<string, unknown>

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === 'object' && !Array.isArray(item)) : []
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => text(item) ?? []) : []
}
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null }

function fiscalPeriod(row: Row): EarningsFiscalPeriod | null {
  const year = integer(row.fiscalYear), quarter = integer(row.fiscalQuarter)
  return year && year >= 1900 && year <= 9999 && quarter && quarter <= 4 ? { fiscalYear: year, fiscalQuarter: quarter } : null
}

function corrections(value: unknown): EarningsCallCorrection[] {
  return rows(value).map(row => ({
    metricLabel: text(row.metricLabel), transcriptQuote: text(row.transcriptQuote),
    transcriptValue: text(row.transcriptValue), filingValue: text(row.filingValue), filingForm: text(row.filingForm),
    filingFiledDate: text(row.filingFiledDate), note: text(row.note),
  })).filter(row => Object.values(row).some(Boolean))
}

function guidanceItem(row: Row): EarningsCallGuidanceItem {
  return {
    metric: text(row.metric), period: text(row.period), fiscalYear: integer(row.fiscalYear),
    fiscalQuarter: integer(row.fiscalQuarter), low: number(row.low), high: number(row.high), midpoint: number(row.midpoint),
    unit: text(row.unit), basis: text(row.basis), quote: text(row.quote), actual: number(row.actual),
    actualIsDerived: typeof row.actualIsDerived === 'boolean' ? row.actualIsDerived : undefined,
    actualVerdict: text(row.actualVerdict), changeVsPrior: text(row.changeVsPrior),
  }
}

function briefPage(row: Row | null, period: EarningsFiscalPeriod): EarningsCallBriefPage {
  if (!row) return { data: null }
  const shift = record(row.narrativeShift), guidance = record(row.guidanceComparison)
  return { data: {
    ...period, tldr: text(row.tldr), bullish: strings(row.bullish), bearish: strings(row.bearish),
    narrativeShift: Object.keys(shift).length ? {
      priorFiscalYear: integer(shift.priorFiscalYear), priorFiscalQuarter: integer(shift.priorFiscalQuarter),
      newBullish: strings(shift.newBullish), newBearish: strings(shift.newBearish), noLongerRaised: strings(shift.noLongerRaised),
    } : null,
    guidanceComparison: Object.keys(guidance).length ? {
      issuedAtCall: rows(guidance.issuedAtCall).map(source => ({
        filedDate: text(source.filedDate), form: text(source.form), filingUrl: webcast(source.filingUrl),
        items: rows(source.items).map(guidanceItem),
      })),
      reportedVsCompanyGuidance: rows(guidance.reportedVsCompanyGuidance).filter(source => source.item).map(source => ({
        guidanceFiledDate: text(source.guidanceFiledDate), guidanceForm: text(source.guidanceForm),
        guidanceFilingUrl: webcast(source.guidanceFilingUrl), item: guidanceItem(record(source.item)),
      })),
    } : null,
    quotes: rows(row.quotes).flatMap(quote => {
      const words = text(quote.text)
      return words ? [{ text: words, speakerName: text(quote.speakerName), speakerRole: text(quote.speakerRole),
        startSeconds: seconds(quote.startSeconds) }] : []
    }),
  } }
}

function insightsPage(row: Row | null, period: EarningsFiscalPeriod): EarningsCallInsightsPage {
  if (!row) return { data: null }
  return { data: { ...period, themes: rows(row.themes).flatMap(theme => {
    const name = text(theme.name)
    return name ? [{ name, tone: text(theme.tone), mentionCount: integer(theme.mentionCount), keywords: strings(theme.keywords) }] : []
  }) } }
}

function questionsPage(payload: Row, eventId: string): EarningsCallQuestionsPage {
  if (text(payload.eventId)?.toLowerCase() !== eventId || !Array.isArray(payload.data)) return invalidResponse()
  const totalTurnCount = integer(payload.totalTurnCount)
  const participant = (person: Row) => ({ name: text(person.name), role: text(person.role) })
  return { eventId, totalTurnCount, isFiledRecord: payload.isFiledRecord === true, note: text(payload.note),
    data: rows(payload.data).map(row => {
      const firm = record(row.firm), firmName = text(firm.name)
      const start = integer(row.startTurnIndex), end = integer(row.endTurnIndex)
      const validRange = start !== null && end !== null && start < end && (totalTurnCount === null || end <= totalTurnCount)
      return {
        number: integer(row.number), question: text(row.question),
        analyst: participant(record(row.analyst)), firm: firmName ? { name: firmName, source: text(firm.source) } : null,
        answerers: rows(row.answerers).map(participant),
        startTurnIndex: validRange ? start : null, endTurnIndex: validRange ? end : null,
        startSeconds: payload.timed === false ? null : seconds(row.startSeconds), endSeconds: payload.timed === false ? null : seconds(row.endSeconds),
      }
    }),
  }
}

function themeHistory(payload: Row, ticker: string): EarningsCallThemeHistory {
  if (text(payload.ticker)?.toUpperCase() !== ticker || !Array.isArray(payload.calls) || !Array.isArray(payload.themes)) return invalidResponse()
  return { ticker, hasMoreCalls: payload.hasMoreCalls === true, note: text(payload.note),
    calls: rows(payload.calls).flatMap(row => {
      const period = fiscalPeriod(row)
      return period ? [{ ...period, callDate: text(row.callDate), unscoredQuartersBefore: integer(row.unscoredQuartersBefore) }] : []
    }),
    themes: rows(payload.themes).flatMap(row => {
      const name = text(row.name)
      if (!name) return []
      const status = row.status
      return [{ name, status: status === 'new' || status === 'recurring' || status === 'dropped' ? status : 'unknown',
        firstSeen: fiscalPeriod(record(row.firstSeen)), lastSeen: fiscalPeriod(record(row.lastSeen)),
        entries: rows(row.entries).flatMap(item => {
          const period = fiscalPeriod(item)
          return period ? [{ ...period, mentionCount: integer(item.mentionCount), tone: text(item.tone) }] : []
        }),
      }]
    }),
  }
}

function phraseTrend(payload: Row, ticker: string, phrase: string): EarningsCallPhraseTrend {
  if (text(payload.ticker)?.toUpperCase() !== ticker || text(payload.phrase)?.toLowerCase() !== phrase.toLowerCase() || !Array.isArray(payload.calls)) return invalidResponse()
  return { ticker, phrase: text(payload.phrase)!, hasMoreCalls: payload.hasMoreCalls === true, note: text(payload.note),
    calls: rows(payload.calls).flatMap(row => {
      const period = fiscalPeriod(row)
      if (!period) return []
      const textSource = text(row.textSource)
      const counted = textSource === 'speakerTurns' || textSource === 'transcriptDocument'
      const split = counted && row.sectionSplit === 'detected'
      return [{ ...period, callDate: text(row.callDate), callDateIsPeriodEnd: row.callDateIsPeriodEnd === true,
        missingQuartersBefore: integer(row.missingQuartersBefore), textSource,
        mentions: counted ? integer(row.mentions) : null, wordCount: counted ? integer(row.wordCount) : null,
        ratePer10kWords: counted ? number(row.ratePer10kWords) : null, sectionSplit: text(row.sectionSplit),
        preparedRemarksMentions: split ? integer(row.preparedRemarksMentions) : null,
        qaMentions: split ? integer(row.qaMentions) : null,
        quotes: rows(row.quotes).flatMap(quote => {
          const words = text(quote.text)
          return words ? [{ text: words, section: text(quote.section) }] : []
        }),
      }]
    }),
  }
}

function analyticsSpec(route: string, params: URLSearchParams): RequestSpec {
  const spec = (url: URL, parse: RequestSpec['parse'], empty: () => Page, cacheKey = url.href): RequestSpec =>
    ({ url, parse, onNotFound: empty, ttl: DAY, cacheKey })
  if (route === 'questions') {
    const id = (params.get('eventId') ?? '').toLowerCase()
    if (!EVENT_ID.test(id)) throw new EquiblesError(400, 'Invalid earnings-call identifier.')
    return spec(new URL('investor-events/' + id + '/questions', API_ROOT), row => questionsPage(row, id),
      () => ({ eventId: id, totalTurnCount: null, isFiledRecord: false, data: [], note: 'Equibles has no analyst Q&A for this event.' }))
  }
  const ticker = listing(params.get('symbol') ?? ''), stock = 'stocks/' + encodeURIComponent(ticker) + '/'
  if (route === 'theme-history' || route === 'phrase-trend') {
    const calls = params.get('calls') ?? '8'
    if (!/^(?:[1-9]|1[0-2])$/.test(calls)) throw new EquiblesError(400, 'Choose one to twelve calls.')
    const url = new URL(stock + (route === 'theme-history' ? 'call-themes/history' : 'earnings-calls/phrase-trend'), API_ROOT)
    url.searchParams.set('calls', calls)
    if (route === 'theme-history') return spec(url, row => themeHistory(row, ticker),
      () => ({ ticker, calls: [], themes: [], hasMoreCalls: false, note: 'No scored call history is available.' }))
    const phrase = (params.get('phrase') ?? '').trim().replace(/\s+/gu, ' ')
    if (Array.from(phrase).length < 2 || Array.from(phrase).length > 80 || /[\u0000-\u001f\u007f]/u.test(phrase)) throw new EquiblesError(400, 'Enter a phrase between 2 and 80 characters.')
    url.searchParams.set('phrase', phrase)
    return spec(url, row => phraseTrend(row, ticker, phrase),
      () => ({ ticker, phrase, calls: [], hasMoreCalls: false, note: 'No phrase history is available.' }))
  }
  const period = fiscalPeriod({ fiscalYear: Number(params.get('fiscalYear')), fiscalQuarter: Number(params.get('fiscalQuarter')) })
  if (!period) throw new EquiblesError(400, 'Select a reported fiscal year and quarter.')
  if (route === 'guidance') {
    const id = (params.get('eventId') ?? '').toLowerCase()
    if (!EVENT_ID.test(id)) throw new EquiblesError(400, 'Invalid earnings-call identifier.')
    const url = new URL(stock + 'earnings-calls/' + period.fiscalYear + '/' + period.fiscalQuarter, API_ROOT)
    return spec(url, row => {
      if (text(row.id)?.toLowerCase() !== id || row.fiscalYear !== period.fiscalYear || row.fiscalQuarter !== period.fiscalQuarter || row.eventType !== 'EarningsCall') return invalidResponse()
      return { guidanceStatus: text(row.guidanceStatus), guidance: rows(row.guidance).map(guidanceItem), corrections: corrections(row.corrections) }
    }, () => ({ guidanceStatus: null, guidance: [], corrections: [] }), url.href + '#' + id)
  }
  const url = new URL(stock + (route === 'brief' ? 'earnings-briefs' : 'call-insights'), API_ROOT)
  url.search = new URLSearchParams({ fiscalYear: String(period.fiscalYear), fiscalQuarter: String(period.fiscalQuarter), limit: '1' }).toString()
  return spec(url, row => {
    if (!Array.isArray(row.data)) return invalidResponse()
    const matches = rows(row.data).filter(item => item.fiscalYear === period.fiscalYear && item.fiscalQuarter === period.fiscalQuarter)
    const match = matches.length === 1 ? matches[0] : null
    return route === 'brief' ? briefPage(match, period) : insightsPage(match, period)
  }, () => ({ data: null }))
}

interface RequestSpec {
  url: URL
  parse: (row: Record<string, unknown>) => Page
  ttl: number
  cacheKey: string
  onNotFound?: () => Page
}
function dateParam(params: URLSearchParams, name: string) {
  const value = params.get(name) ?? ''
  const time = Date.parse(value + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new EquiblesError(400, 'Please select a valid calendar date.')
  }
  return { value, time }
}

function requestSpec(route: string, params: URLSearchParams): RequestSpec {
  if (['questions', 'brief', 'insights', 'guidance', 'theme-history', 'phrase-trend'].includes(route)) return analyticsSpec(route, params)
  const offsetString = params.get('offset') ?? '0'
  const offset = Number(offsetString)
  if (!/^\d+$/.test(offsetString) || !Number.isSafeInteger(offset) || offset > 2_147_483_647) throw new EquiblesError(400, 'Invalid page offset.')
  if (route === 'transcript') {
    const id = (params.get('eventId') ?? '').toLowerCase()
    if (!EVENT_ID.test(id)) throw new EquiblesError(400, 'Invalid earnings-call identifier.')
    const url = new URL(`investor-events/${id}/speakers`, API_ROOT)
    url.search = new URLSearchParams({ limit: String(EARNINGS_TRANSCRIPT_PAGE_SIZE), offset: String(offset) }).toString()
    return { url, ttl: DAY, cacheKey: url.href, parse: row => transcriptPage(row, offset, id) }
  }
  let url: URL
  const symbols = new Map<string, string>()
  let fallbackTicker: string | undefined
  if (route === 'calls') {
    const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
    fallbackTicker = listing(symbol)
    symbols.set(fallbackTicker, symbol)
    url = new URL(`stocks/${encodeURIComponent(fallbackTicker)}/investor-events`, API_ROOT)
    url.searchParams.set('includeUncaptured', 'true')
  } else if (route === 'recent') {
    const since = dateParam(params, 'since'), until = dateParam(params, 'until')
    if (until.time <= since.time || until.time - since.time > 31 * DAY) throw new EquiblesError(400, 'Select a range of one to 31 days.')
    const tickers = (params.get('symbols') ?? '').split(',').map(symbol => symbol.trim().toUpperCase())
    if (!tickers[0] || tickers.length > 25) throw new EquiblesError(400, 'Choose one to 25 tickers for calendar availability.')
    for (const ticker of tickers.sort()) symbols.set(listing(ticker), ticker)
    url = new URL('investor-events/recent', API_ROOT)
    url.search = new URLSearchParams({ since: since.value, until: until.value, tickers: [...symbols.keys()].join(',') }).toString()
  } else {
    throw new EquiblesError(404, 'Unknown Equibles route.')
  }
  url.searchParams.set('eventType', 'EarningsCall')
  url.searchParams.set('limit', '100')
  url.searchParams.set('offset', String(offset))
  return { url, ttl: HOUR, cacheKey: url.href + '#' + [...symbols.values()].join(','),
    parse: row => listPage(row, offset, symbols, fallbackTicker) }
}

function quotaReset(headers: Headers, now: number) {
  const retry = headers.get('Retry-After')?.trim()
  const reset = Number(headers.get('X-RateLimit-Reset')) * 1000
  const retryTime = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? '')
  if (Number.isFinite(retryTime) && retryTime >= now && retryTime <= 8.64e15) return retryTime
  if (Number.isFinite(reset) && reset > now && reset <= 8.64e15) return reset
  return (Math.floor(now / DAY) + 1) * DAY
}

interface CachedPage { savedAt: number; data: Page }
function accountCache() {
  return { cache: new Map<string, CachedPage>(), inFlight: new Map<string, Promise<Page>>(), retryAt: 0 }
}

/** Shares calls between workspaces and respects the account-wide REST/MCP allowance. */
export function createEquiblesService(request: typeof fetch = fetch, clock: () => number = Date.now) {
  let currentKey: string | null = null
  let current = accountCache()

  function clear() {
    currentKey = null
    current = accountCache()
  }

  async function get(route: string, params: URLSearchParams, apiKey: string | null): Promise<Page> {
    if (currentKey !== apiKey) { clear(); currentKey = apiKey }
    if (!apiKey) throw new EquiblesError(401, 'Add your Equibles API key in Settings → Connections to access earnings calls.')
    const spec = requestSpec(route, params)
    const account = current
    const cached = account.cache.get(spec.cacheKey)
    if (cached && clock() - cached.savedAt < spec.ttl) return cached.data
    const pending = account.inFlight.get(spec.cacheKey)
    if (pending) return pending
    const load = async (): Promise<Page> => {
      const rateError = () => new EquiblesError(429, `Equibles request allowance reached. Try again after ${new Date(account.retryAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.`, account.retryAt)
      if (account.retryAt > clock()) throw rateError()
      const response = await request(spec.url, {
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + apiKey },
        redirect: 'error', signal: AbortSignal.timeout(12_000),
      })
      if (response.status === 429 || response.headers.get('X-RateLimit-Remaining') === '0') {
        account.retryAt = Math.max(account.retryAt, quotaReset(response.headers, clock()))
      }
      if (response.status === 429) throw rateError()
      if (response.status === 401) throw new EquiblesError(401, 'Equibles rejected this API key. Check your key in Settings → Connections.')
      if (response.status === 403) throw new EquiblesError(403, 'Your Equibles account does not have access to this material.')
      let data: Page
      if (response.status === 404) {
        if (!spec.onNotFound) throw new EquiblesError(404, 'Equibles has no matching earnings-call data yet.')
        data = spec.onNotFound()
      } else {
        if (!response.ok) throw new EquiblesError(502, 'Equibles is temporarily unavailable. Please try again later.')
        data = spec.parse(record(await response.json()))
      }
      if (account.cache.size >= 160 && !cached) account.cache.delete(account.cache.keys().next().value!)
      account.cache.set(spec.cacheKey, { savedAt: clock(), data })
      return data
    }
    const promise = load().catch((cause: unknown) => {
      const error = cause instanceof EquiblesError ? cause : new EquiblesError(502, 'Could not reach Equibles. Please try again later.')
      if (cached && (error.status === 429 || error.status >= 500)) {
        return { ...cached.data, stale: true, notice: 'Showing a cached copy. ' + error.message }
      }
      throw error
    }).finally(() => account.inFlight.delete(spec.cacheKey))
    account.inFlight.set(spec.cacheKey, promise)
    return promise
  }
  return { get, clear }
}

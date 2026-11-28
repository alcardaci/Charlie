import assert from 'node:assert/strict'
import { createEquiblesService, EquiblesError } from '../../server/equibles'
import type {
  EarningsCallBriefPage, EarningsCallGuidancePage, EarningsCallInsightsPage, EarningsCallListPage,
  EarningsCallPhraseTrend, EarningsCallQuestionsPage, EarningsCallThemeHistory, EarningsCallTranscriptPage,
} from '../../src/types/earningsCalls'

const id = 'c00c67f3-ef10-4170-b13e-b51dac2ba048'
const key = 'test-only'
const hour = 3_600_000
let time = Date.UTC(2026, 10, 28, 12)
const requests: URL[] = []
let answer: () => Response
const service = createEquiblesService(async (input, init) => {
  const url = new URL(input.toString())
  assert.equal(url.origin, 'https://api.equibles.com')
  assert.ok(!url.href.includes(key))
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + key)
  requests.push(url)
  return answer()
}, () => time)
const listParams = new URLSearchParams({ symbol: 'NVD.DE' })
const list = () => service.get('calls', listParams, key) as Promise<EarningsCallListPage>
const speakers = () => service.get('transcript', new URLSearchParams({ eventId: id, offset: '200' }), key) as Promise<EarningsCallTranscriptPage>
const errorIs = (status: number) => (error: unknown) => error instanceof EquiblesError && error.status === status
const row = { id, title: 'Quarterly results', eventType: 'EarningsCall', fiscalYear: 2027, fiscalQuarter: 1,
  hasTranscript: true, hasAudio: true, hasSlides: true, callDateIsPeriodEnd: true, webcastUrl: 'javascript:fake',
  materials: { transcript: { status: 'available' } } }
const listData = { data: [row, { ...row, id: undefined }, { ...row, eventType: 'Conference' }],
  meta: { offset: 0, count: 3, limit: 100, hasMore: true } }
await assert.rejects(service.get('calls', listParams, null), errorIs(401))
await assert.rejects(service.get('calls', new URLSearchParams({ symbol: 'NVDA.UNKNOWN' }), key), errorIs(422))
await assert.rejects(service.get('transcript', new URLSearchParams({ eventId: '../other' }), key), errorIs(400))
await assert.rejects(service.get('recent', new URLSearchParams({ since: '2026-02-31', until: '2026-03-06', symbols: 'AAPL' }), key), errorIs(400))
await assert.rejects(service.get('recent', new URLSearchParams({ since: '2026-10-01', until: '2026-11-03', symbols: 'AAPL' }), key), errorIs(400))
assert.equal(requests.length, 0)

answer = () => Response.json(listData)
const [first, concurrent] = await Promise.all([list(), list()])
assert.deepEqual(concurrent, first)
assert.deepEqual(await list(), first)
assert.equal(requests.length, 1)
assert.equal(decodeURIComponent(requests[0].pathname), '/v1/stocks/XETR:NVD/investor-events')
assert.equal(requests[0].searchParams.get('eventType'), 'EarningsCall')
assert.equal(requests[0].searchParams.get('includeUncaptured'), 'true')
assert.equal(first.data.length, 1)
assert.equal(first.data[0].replayUrl, 'https://equibles.com/stocks/xetr/nvd/calls/2027-q1')
assert.equal(first.data[0].slidesUrl, 'https://equibles.com/stocks/xetr/nvd/calls/2027-q1/slides')
assert.equal(first.data[0].callDateIsPeriodEnd, true)
assert.equal(first.data[0].webcastUrl, null)
assert.equal(first.meta.count, 3)

const recentParams = new URLSearchParams({ since: '2026-11-01', until: '2026-11-28', symbols: 'NVD.DE,AAPL' })
answer = () => Response.json({ data: [{ ...row, ticker: 'XETR:NVD' }, { ...row, ticker: 'OTHER' }], meta: { hasMore: false } })
const recent = await service.get('recent', recentParams, key) as EarningsCallListPage
assert.deepEqual(recent.data.map(event => event.ticker), ['NVD.DE'])
assert.equal(requests[1].searchParams.get('tickers'), 'AAPL,XETR:NVD')
assert.equal(requests[1].searchParams.get('limit'), '100')
const transcriptData = { eventId: id, ticker: 'NVDA', offset: 200, hasMore: false, totalTurnCount: 203, turnCount: 3,
  isFiledRecord: true, hasSpeakerLabels: false, corrections: [{ note: 'Source correction.' }],
  data: [{ speakerIndex: 0, text: 'First words', startSeconds: 0, endSeconds: 11.5 }, { text: '' }, { text: 'Untimed' }] }
answer = () => Response.json(transcriptData)
const page = await speakers()
assert.equal(requests[2].pathname, '/v1/investor-events/' + id + '/speakers')
assert.equal(requests[2].searchParams.get('limit'), '200')
assert.equal(requests[2].searchParams.get('offset'), '200')
assert.equal(page.hasSpeakerLabels, false)
assert.equal(page.isFiledRecord, true)
assert.equal(page.corrections[0].note, 'Source correction.')
assert.equal(page.data[0].startSeconds, 0)
assert.equal(page.data[1].startSeconds, null)
assert.equal(page.turnCount, 3)
assert.deepEqual(page.data.map(turn => turn.turnIndex), [200, 202], 'Keep absolute offsets across filtered transcript turns')

time += hour + 10
answer = () => new Response('', { status: 429, headers: { 'Retry-After': '45' } })
assert.equal((await list()).stale, true)
const quotaReads = requests.length
const freshParams = new URLSearchParams({ symbol: 'MSFT' })
await assert.rejects(service.get('calls', freshParams, key), errorIs(429))
assert.equal((await speakers()).data.length, 2, 'Fresh cache accessible after provider exhausts quota')
assert.equal(requests.length, quotaReads)
time += 46_000
answer = () => Response.json(listData, { headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.floor((time + hour) / 1000)) } })
assert.equal((await list()).stale, undefined)
await assert.rejects(service.get('calls', freshParams, key), errorIs(429))
assert.equal(requests.length, quotaReads + 1)

service.clear()
const resetAt = time + hour
answer = () => new Response('', { status: 429, headers: { 'Retry-After': new Date(resetAt).toUTCString() } })
await assert.rejects(list(), error => error instanceof EquiblesError && error.retryAt === Math.floor(resetAt / 1000) * 1000)
service.clear()
answer = () => new Response('', { status: 401 })
await assert.rejects(list(), errorIs(401))
answer = () => new Response('', { status: 404 })
await assert.rejects(speakers(), errorIs(404))
answer = () => Response.json({ ...transcriptData, eventId: 'invalid' })
await assert.rejects(speakers(), errorIs(502))
answer = () => Response.json({ ...transcriptData, data: [], hasMore: true })
await assert.rejects(speakers(), errorIs(502))
answer = () => Response.json(listData)
await list()
time += 2 * hour
answer = () => { throw new TypeError('offline') }
assert.equal((await list()).stale, true)
answer = () => new Response('', { status: 403 })
await assert.rejects(list(), errorIs(403), 'Do not serve cached material on an authorization error')

service.clear()
const periodParams = new URLSearchParams({ symbol: 'NVD.DE', fiscalYear: '2027', fiscalQuarter: '1' })
const period = { fiscalYear: 2027, fiscalQuarter: 1 }
const item = { metric: 'EPS', low: -0.07, high: 0, unit: 'USD/share', actualIsDerived: true }
const brief = () => service.get('brief', periodParams, key) as Promise<EarningsCallBriefPage>
const noRequestsYet = requests.length
for (const params of [{ fiscalYear: '2027' }, { fiscalYear: '2027', fiscalQuarter: '5' }]) {
  await assert.rejects(service.get('brief', new URLSearchParams({ symbol: 'NVDA', ...params } as Record<string, string>), key), errorIs(400))
}
for (const badPhrase of ['', 'A', 'x'.repeat(81)]) {
  await assert.rejects(service.get('phrase-trend', new URLSearchParams({ symbol: 'NVDA', phrase: badPhrase }), key), errorIs(400))
}
assert.equal(requests.length, noRequestsYet)
answer = () => Response.json({ data: [{ fiscalYear: 2026, fiscalQuarter: 4, tldr: 'Wrong quarter' }] })
assert.equal((await brief()).data, null)
service.clear()
answer = () => Response.json({ data: [{
  ...period, bullish: ['Orders grew'], narrativeShift: { priorFiscalYear: 2026, priorFiscalQuarter: 4, newBullish: ['Orders grew'] },
  guidanceComparison: { issuedAtCall: [{ items: [item], filingUrl: 'javascript:fake' }] },
  quotes: [{ text: 'Order intake grew.', startSeconds: 0 }, { speakerName: 'Missing quote' }],
}] })
const resultBrief = (await brief()).data!
assert.equal(decodeURIComponent(requests.at(-1)!.pathname), '/v1/stocks/XETR:NVD/earnings-briefs')
assert.equal(requests.at(-1)!.searchParams.get('fiscalQuarter'), '1')
assert.equal(resultBrief.tldr, null)
assert.deepEqual(resultBrief.bearish, [])
assert.equal(resultBrief.narrativeShift?.priorFiscalYear, 2026)
const statement = resultBrief.guidanceComparison?.issuedAtCall[0]
assert.deepEqual([statement?.items[0].low, statement?.items[0].high, statement?.filingUrl], [-0.07, 0, null])
assert.equal(statement?.items[0].actualIsDerived, true)
assert.equal(resultBrief.quotes[0].startSeconds, 0)
assert.equal(resultBrief.quotes.length, 1)
answer = () => Response.json({ data: [{ ...period, themes: [{ name: 'Capacity', keywords: ['fab'], mentionCount: 0 }] }] })
const insight = await service.get('insights', periodParams, key) as EarningsCallInsightsPage
assert.equal(insight.data?.themes[0].mentionCount, 0)

const eventParams = new URLSearchParams(periodParams)
eventParams.set('eventId', id)
answer = () => Response.json({ ...row, guidance: [item], guidanceStatus: 'approved', corrections: [{ filingForm: '10-Q', transcriptValue: '4M', filingValue: '3M' }] })
const guidance = await service.get('guidance', eventParams, key) as EarningsCallGuidancePage
assert.equal(guidance.guidance[0].low, -0.07)
assert.equal(guidance.corrections[0].filingValue, '3M')
eventParams.set('eventId', 'c861764f-9fe0-4987-9548-16574581ea83')
await assert.rejects(service.get('guidance', eventParams, key), errorIs(502), 'A quarter cannot substitute for another event ID')
eventParams.set('eventId', id)
answer = () => Response.json({ eventId: id, totalTurnCount: 215, data: [
  { question: 'Why?', analyst: { name: 'A' }, firm: { name: 'B' }, answerers: [{ name: 'C', role: 'CEO' }],
    startTurnIndex: 199, endTurnIndex: 203, startSeconds: 0 },
  { startTurnIndex: 200, endTurnIndex: 230 },
] })
const questions = await service.get('questions', eventParams, key) as EarningsCallQuestionsPage
assert.equal(requests.at(-1)!.pathname, '/v1/investor-events/' + id + '/questions')
assert.deepEqual(questions.data[0].answerers, [{ name: 'C', role: 'CEO' }])
assert.deepEqual([questions.data[0].startTurnIndex, questions.data[0].endTurnIndex, questions.data[0].startSeconds], [199, 203, 0])
assert.equal(questions.data[1].startTurnIndex, null, 'Invalid range must not offer a transcript jump')

const trendsParams = new URLSearchParams({ symbol: 'NVDA', calls: '12' })
answer = () => Response.json({ ticker: 'NVDA', calls: [period], themes: [
  { name: 'Wafers', status: 'unknown', entries: [{ ...period, mentionCount: null }] },
] })
const history = await service.get('theme-history', trendsParams, key) as EarningsCallThemeHistory
assert.equal(history.themes[0].entries[0].mentionCount, null)
assert.equal(history.themes[0].status, 'unknown')
trendsParams.set('phrase', 'supply & demand')
answer = () => Response.json({ ticker: 'NVDA', phrase: 'supply & demand', calls: [
  { ...period, textSource: 'speakerTurns', mentions: 0, wordCount: 2000, ratePer10kWords: 0 },
  { ...period, fiscalQuarter: 2, textSource: 'unsupportedLanguage', mentions: 0 },
] })
const phrase = await service.get('phrase-trend', trendsParams, key) as EarningsCallPhraseTrend
assert.equal(requests.at(-1)!.searchParams.get('phrase'), 'supply & demand')
assert.deepEqual(phrase.calls.map(call => call.mentions), [0, null])
assert.equal(phrase.calls[0].qaMentions, null, 'Unknown section boundaries do not mean zero mentions')
trendsParams.set('phrase', 'distinct')
await assert.rejects(service.get('phrase-trend', trendsParams, key), errorIs(502), 'A response for a different phrase is not a result')
answer = () => new Response('', { status: 404 })
const missing = await service.get('phrase-trend', trendsParams, key) as EarningsCallPhraseTrend
const countAfterMissing = requests.length
assert.ok(missing.note && missing.calls.length === 0)
assert.deepEqual(await service.get('phrase-trend', trendsParams, key), missing)
assert.equal(requests.length, countAfterMissing, 'Revisiting unavailable research must not spend more quota')

const accountRequests: string[] = []
let finishFirstAccount!: (response: Response) => void
const firstAccountResponse = new Promise<Response>(resolve => { finishFirstAccount = resolve })
const rotated = createEquiblesService(async (_url, init) => {
  const auth = new Headers(init?.headers).get('authorization')!
  accountRequests.push(auth)
  if (auth === 'Bearer first-test-account') return firstAccountResponse
  return Response.json({ data: [{ ...period, tldr: 'Second account' }] })
}, () => time)
const readBrief = (account: string) => rotated.get('brief', periodParams, account) as Promise<EarningsCallBriefPage>
const oldRequest = readBrief('first-test-account')
assert.equal((await readBrief('second-test-account')).data?.tldr, 'Second account')
finishFirstAccount(Response.json({ data: [{ ...period, tldr: 'First account' }] }, { headers: { 'X-RateLimit-Remaining': '0' } }))
assert.equal((await oldRequest).data?.tldr, 'First account')
assert.equal((await readBrief('second-test-account')).data?.tldr, 'Second account', 'An old request must not overwrite the current key\'s cache')
await rotated.get('brief', new URLSearchParams({ symbol: 'AAPL', fiscalYear: '2027', fiscalQuarter: '1' }), 'second-test-account')
assert.deepEqual(accountRequests, ['Bearer first-test-account', 'Bearer second-test-account', 'Bearer second-test-account'], 'Quotas are scoped to the active key')
console.log('Equibles provider checks passed for discovery, transcripts, analytics, period identity, pagination, caching and quotas.')

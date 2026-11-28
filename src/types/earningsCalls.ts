export const EARNINGS_TRANSCRIPT_PAGE_SIZE = 200;

export interface EarningsCallMaterial {
  status: string | null;
  reason: string | null;
  nextAttemptAt: string | null;
}

export interface EarningsCallEvent {
  id: string;
  ticker: string;
  title: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  callDate: string | null;
  callDateIsPeriodEnd: boolean;
  status: string | null;
  statusName: string | null;
  hasTranscript: boolean;
  hasAudio: boolean;
  hasSlides: boolean;
  presentationOnly: boolean;
  partialRecording: boolean;
  webcastUrl: string | null;
  /** Public Equibles page for the recorded call, when available. */
  replayUrl: string | null;
  slidesUrl?: string | null;
  materials: {
    transcript: EarningsCallMaterial | null;
    audio: EarningsCallMaterial | null;
    slides: EarningsCallMaterial | null;
  };
}

interface EarningsCallCacheInfo {
  stale?: boolean;
  notice?: string;
}

export interface EarningsCallListPage extends EarningsCallCacheInfo {
  data: EarningsCallEvent[];
  /** Count and offset refer to source rows, including any unusable records. */
  meta: { offset: number; count: number; limit: number; hasMore: boolean };
}

export interface EarningsCallTurn {
  /** Zero-based offset in the provider's unfiltered transcript. */
  turnIndex: number;
  speakerIndex: number | null;
  speakerName: string | null;
  speakerRole: string | null;
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface EarningsCallCorrection {
  metricLabel: string | null;
  transcriptQuote: string | null;
  transcriptValue: string | null;
  filingValue: string | null;
  filingForm: string | null;
  filingFiledDate: string | null;
  note: string | null;
}

export interface EarningsCallTranscriptPage extends EarningsCallCacheInfo {
  eventId: string;
  ticker: string | null;
  eventTitle: string | null;
  callDate: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  offset: number;
  turnCount: number;
  totalTurnCount: number | null;
  hasMore: boolean;
  isFiledRecord: boolean;
  hasSpeakerLabels: boolean;
  data: EarningsCallTurn[];
  corrections: EarningsCallCorrection[];
}

export interface EarningsCallGuidanceItem {
  metric: string | null;
  period: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  low: number | null;
  high: number | null;
  midpoint: number | null;
  unit: string | null;
  basis: string | null;
  quote: string | null;
  actual: number | null;
  actualIsDerived?: boolean;
  actualVerdict: string | null;
  changeVsPrior: string | null;
}

export interface EarningsCallQuote {
  text: string;
  speakerName: string | null;
  speakerRole: string | null;
  startSeconds: number | null;
}

export interface EarningsFiscalPeriod {
  fiscalYear: number;
  fiscalQuarter: number;
}

export interface EarningsCallBrief extends EarningsFiscalPeriod {
  tldr: string | null;
  bullish: string[];
  bearish: string[];
  narrativeShift: {
    priorFiscalYear: number | null;
    priorFiscalQuarter: number | null;
    newBullish: string[];
    newBearish: string[];
    noLongerRaised: string[];
  } | null;
  guidanceComparison: {
    issuedAtCall: { filedDate: string | null; form: string | null; filingUrl: string | null; items: EarningsCallGuidanceItem[] }[];
    reportedVsCompanyGuidance: { guidanceFiledDate: string | null; guidanceForm: string | null; guidanceFilingUrl: string | null; item: EarningsCallGuidanceItem }[];
  } | null;
  quotes: EarningsCallQuote[];
}

export interface EarningsCallBriefPage extends EarningsCallCacheInfo {
  data: EarningsCallBrief | null;
}

export interface EarningsCallInsightsPage extends EarningsCallCacheInfo {
  data: (EarningsFiscalPeriod & {
    themes: { name: string; tone: string | null; mentionCount: number | null; keywords: string[] }[];
  }) | null;
}

export interface EarningsCallGuidancePage extends EarningsCallCacheInfo {
  guidanceStatus: string | null;
  guidance: EarningsCallGuidanceItem[];
  corrections: EarningsCallCorrection[];
}

export interface EarningsCallParticipant {
  name: string | null;
  role: string | null;
}

export interface EarningsCallQuestion {
  number: number | null;
  analyst: EarningsCallParticipant;
  firm: { name: string; source: string | null } | null;
  question: string | null;
  answerers: EarningsCallParticipant[];
  startTurnIndex: number | null;
  endTurnIndex: number | null;
  startSeconds: number | null;
  endSeconds: number | null;
}

export interface EarningsCallQuestionsPage extends EarningsCallCacheInfo {
  eventId: string;
  totalTurnCount: number | null;
  isFiledRecord: boolean;
  data: EarningsCallQuestion[];
  note: string | null;
}

export interface EarningsCallThemeHistory extends EarningsCallCacheInfo {
  ticker: string;
  calls: (EarningsFiscalPeriod & {callDate: string | null; unscoredQuartersBefore: number | null})[];
  themes: {
    name: string;
    status: 'new' | 'recurring' | 'dropped' | 'unknown';
    firstSeen: EarningsFiscalPeriod | null;
    lastSeen: EarningsFiscalPeriod | null;
    entries: (EarningsFiscalPeriod & {mentionCount: number | null; tone: string | null})[];
  }[];
  hasMoreCalls: boolean;
  note: string | null;
}

export interface EarningsCallPhraseTrend extends EarningsCallCacheInfo {
  ticker: string;
  phrase: string;
  calls: (EarningsFiscalPeriod & {
    callDate: string | null;
    callDateIsPeriodEnd: boolean;
    textSource: string | null;
    missingQuartersBefore: number | null;
    mentions: number | null;
    wordCount: number | null;
    ratePer10kWords: number | null;
    sectionSplit: string | null;
    preparedRemarksMentions: number | null;
    qaMentions: number | null;
    quotes: {text: string; section: string | null}[];
  })[];
  hasMoreCalls: boolean;
  note: string | null;
}

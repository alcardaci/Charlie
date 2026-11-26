export type Chamber = 'House' | 'Senate';

export interface CongressTrade {
  id: string;
  filingId: string;
  memberId: string;
  memberName: string;
  chamber: Chamber;
  owner: string | null;
  asset: string | null;
  ticker: string | null;
  action: string;
  amount: string | null;
  tradeDate: string | null;
  filingDate: string | null;
  filingUrl: string | null;
  amendment: boolean;
}

export interface CongressMember {
  isNonMember?: boolean;
  id: string;
  name: string;
  chamber: Chamber;
  party: string | null;
  state: string | null;
  district: string | null;
}

export interface CongressGap {
  chamber: Chamber;
  filingId: string;
  memberName: string;
  filingDate: string | null;
  filingUrl: string | null;
  reason: string;
}

// Subtract civil dates at UTC midnight so daylight-saving changes never affect the delay.
export function filingDelay(tradeDate: string | null, filingDate: string | null): number | null {
  if (!tradeDate || !filingDate) return null;
  const days = (Date.parse(`${filingDate}T00:00:00Z`) - Date.parse(`${tradeDate}T00:00:00Z`)) / 86_400_000;
  return Number.isInteger(days) ? days : null;
}

// Exchanges can identify two securities in the source's printed ticker field.
export function congressTickers(reported: string | null): string[] {
  return [...new Set((reported ?? '').toUpperCase().split(/\s+/).filter(symbol => /^\^?[A-Z0-9][A-Z0-9.=\-]*$/.test(symbol) && symbol !== 'NONE'))];
}

export const congressPageSize = 50;

export interface CongressCoverage {
  chamber: Chamber;
  latestFiling: string | null;
  snapshotAsOf: string | null;
  snapshotChecked: string | null;
  indexChecked: string | null;
  windowStart: string | null;
  warnings: string[];
  gaps: CongressGap[];
}

export interface CongressPage {
  refreshing?: boolean;
  rows: CongressTrade[];
  total: number;
  offset: number;
  members: CongressMember[];
  coverage: CongressCoverage[];
}

export function congressMemberKey(memberId: string, chamber: Chamber) {
  return `${chamber}:${memberId}`;
}

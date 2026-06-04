import { PanelType } from '../types';

export const SCREEN_COMMANDS: Record<string, PanelType> = {
  OPP: 'opportunities', OPPS: 'opportunities', IDEA: 'opportunities', IDEAS: 'opportunities', OPPORTUNITY: 'opportunities', OPPORTUNITIES: 'opportunities',
  DISC: 'opportunities', DISCOVER: 'opportunities', DISCOVERY: 'opportunities', THEME: 'opportunities', THEMES: 'opportunities',
  NEWS: 'news', TOP: 'news',
  GEO: 'geopolitics', GEOPOL: 'geopolitics', GEOPOLITICS: 'geopolitics', WORLD: 'geopolitics',
  PRED: 'predictions', PMKT: 'predictions', POLY: 'predictions', PREDICTION: 'predictions', PREDICTIONS: 'predictions', POLYMARKET: 'predictions',
  PORT: 'portfolio', PORTFOLIO: 'portfolio',
  HEAT: 'heatmap', MAP: 'heatmap', SPX: 'heatmap',
  FX: 'forex', FXIP: 'forex', FOREX: 'forex',
  CRYPTO: 'crypto', XBT: 'crypto', BTC: 'crypto',
  YIELD: 'yield', WIRP: 'yield', BYFC: 'yield',
  ETF: 'etf', ETFS: 'etf',
  MACRO: 'macro', ECO: 'macro', ECON: 'macro',
  SCREEN: 'screener', EQS: 'screener',
  HOME: 'overview', OVERVIEW: 'overview', WB: 'overview', WL: 'overview',
  SETTINGS: 'settings', SETUP: 'settings', CONFIG: 'settings', AI: 'settings',
  HELP: 'help',
};

const TICKER_SUBCOMMANDS = new Set(['EQ', 'US', 'EQUITY', 'GP', 'CHART', 'G', 'N', 'NEWS', 'WL', 'ADD']);
const SYMBOL_TOKEN_PATTERN = /^[A-Z0-9.\^\-]{1,24}$/;

export function normalizeCommandInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export function tokenizeCommand(raw: string): string[] {
  const normalized = normalizeCommandInput(raw);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

export function isSymbolToken(value: string): boolean {
  return SYMBOL_TOKEN_PATTERN.test(value);
}

export function getScreenCommandPanel(raw: string): PanelType | undefined {
  const normalized = normalizeCommandInput(raw);
  return normalized ? SCREEN_COMMANDS[normalized] : undefined;
}

export function parseTickerSubcommand(raw: string): { symbol: string; subcommand: string } | null {
  const parts = tokenizeCommand(raw);
  if (parts.length !== 2) return null;

  const [symbol, subcommand] = parts;
  if (!isSymbolToken(symbol) || !TICKER_SUBCOMMANDS.has(subcommand)) return null;

  return { symbol, subcommand };
}

export function shouldUseSearch(raw: string): boolean {
  if (raw.trim().length < 2) return false;
  if (getScreenCommandPanel(raw)) return false;
  if (parseTickerSubcommand(raw)) return false;
  return true;
}

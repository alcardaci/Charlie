import { isValidPortfolioPurchaseDate } from './portfolioHistory';

export interface ImportedPortfolioLot {
  symbol: string;
  shares: number;
  avgCost: number;
  currency?: string;
  purchaseDate: string;
}

export interface PortfolioImportResult {
  lots: ImportedPortfolioLot[];
  skippedRows: number;
  sourceLabel: string;
}

const HEADER_ALIASES = {
  symbol: ['symbol', 'ticker', 'security', 'asset'],
  shares: ['quantity', 'qty', 'shares', 'share', 'units'],
  avgCost: ['purchaseprice', 'avgcost', 'averagecost', 'averageprice', 'costbasis', 'costpershare', 'pricepaid'],
  currency: ['currency', 'ccy', 'curr', 'pricecurrency', 'costcurrency'],
  purchaseDate: ['tradedate', 'purchasedate', 'acquiredon', 'acquisitiondate', 'date'],
  transactionType: ['transactiontype', 'action', 'type', 'side'],
} as const;

const YAHOO_FINANCE_SIGNATURE = ['symbol', 'currentprice', 'tradedate', 'purchaseprice', 'quantity'];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[^a-z0-9]+/g, '');
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const delimiters = [',', ';', '\t'] as const;

  let bestDelimiter: ',' | ';' | '\t' = ',';
  let bestCount = -1;

  for (const delimiter of delimiters) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      bestDelimiter = delimiter;
      bestCount = count;
    }
  }

  return bestDelimiter;
}

function parseCsvText(text: string): { normalizedHeaders: string[]; rows: string[][]; decimalComma: boolean } {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const normalizedText = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (inQuotes) throw new Error('The CSV contains an unfinished quoted field.');
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  if (!rows.length) {
    throw new Error('The CSV file is empty.');
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map(normalizeHeader);
  return { normalizedHeaders, rows: dataRows, decimalComma: delimiter === ';' };
}

function findHeaderIndex(headers: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }

  return -1;
}

function parseNumericValue(value: string, decimalComma = false): number | null {
  let normalized = value.trim();
  if (!normalized) return null;
  normalized = normalized.replace(/^\((.*)\)$/, '-$1')
    .replace(/^[A-Za-z]{3}\s*|\s*[A-Za-z]{3}$/g, '')
    .replace(/[$€£¥₹₩\s]/g, '');
  if (!/^-?[\d.,]+$/.test(normalized)) return null;
  const negative = normalized.startsWith('-');
  normalized = normalized.replace(/^-/, '');
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  let decimal: ',' | '.' | null = null;
  if (comma >= 0 && dot >= 0) decimal = comma > dot ? ',' : '.';
  else if (comma >= 0) decimal = decimalComma || !/^\d{1,3}(,\d{3})+$/.test(normalized) ? ',' : null;
  else if (dot >= 0) decimal = '.';
  const group = decimal === ',' ? '.' : ',';
  const parts = decimal ? normalized.split(decimal) : [normalized];
  if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]))) return null;
  const integer = parts[0];
  const groupingPattern = group === ',' ? /^\d{1,3}(,\d{3})+$/ : /^\d{1,3}(\.\d{3})+$/;
  if (!/^\d+$/.test(integer) && !groupingPattern.test(integer)) return null;
  const digits = integer.split(group).join('');
  const parsed = Number(`${negative ? '-' : ''}${digits}${parts.length === 2 ? `.${parts[1]}` : ''}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    year.toString().padStart(4, '0'),
    month.toString().padStart(2, '0'),
    day.toString().padStart(2, '0'),
  ].join('-');
}

function parseDateValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return formatIsoDate(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10));
  }

  match = trimmed.match(/^(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})$/);
  if (match) {
    return formatIsoDate(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10));
  }

  match = trimmed.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (match) {
    return formatIsoDate(Number.parseInt(match[3], 10), Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return formatIsoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeCurrency(value: string): string | undefined {
  const currency = value.trim().toUpperCase().replace(/[^A-Z]/g, '');
  return currency.length === 3 ? currency : undefined;
}

function isUnsupportedTransaction(value: string): boolean {
  const normalized = normalizeHeader(value);
  if (!normalized) return false;
  if (normalized.includes('buy') || normalized.includes('reinvest') || normalized.includes('drip')) return false;

  return (
    normalized.includes('sell') ||
    normalized.includes('short') ||
    normalized.includes('withdraw') ||
    normalized.includes('transferout') ||
    normalized.includes('outbound')
  );
}

export function importPortfolioCsv(text: string): PortfolioImportResult {
  const { normalizedHeaders, rows, decimalComma } = parseCsvText(text);
  const symbolIndex = findHeaderIndex(normalizedHeaders, HEADER_ALIASES.symbol);
  const sharesIndex = findHeaderIndex(normalizedHeaders, HEADER_ALIASES.shares);
  const avgCostIndex = findHeaderIndex(normalizedHeaders, HEADER_ALIASES.avgCost);
  const currencyIndex = findHeaderIndex(normalizedHeaders, HEADER_ALIASES.currency);
  const purchaseDateIndex = findHeaderIndex(normalizedHeaders, HEADER_ALIASES.purchaseDate);
  const transactionTypeIndex = findHeaderIndex(normalizedHeaders, HEADER_ALIASES.transactionType);

  if ([symbolIndex, sharesIndex, avgCostIndex, purchaseDateIndex].some((index) => index === -1)) {
    throw new Error(
      'Unsupported CSV format. Import a Yahoo Finance export or a compatible CSV with symbol, quantity, purchase price, and trade date columns.'
    );
  }

  const headerSet = new Set(normalizedHeaders);
  const sourceLabel = YAHOO_FINANCE_SIGNATURE.every((header) => headerSet.has(header)) ? 'Yahoo Finance' : 'CSV import';
  const lots: ImportedPortfolioLot[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    if (row.every((cell) => cell.trim().length === 0)) continue;

    const transactionType = transactionTypeIndex === -1 ? '' : row[transactionTypeIndex] ?? '';
    if (isUnsupportedTransaction(transactionType)) {
      skippedRows += 1;
      continue;
    }

    const symbol = normalizeSymbol(row[symbolIndex] ?? '');
    const shares = parseNumericValue(row[sharesIndex] ?? '', decimalComma);
    const avgCost = parseNumericValue(row[avgCostIndex] ?? '', decimalComma);
    const currency = currencyIndex === -1 ? undefined : normalizeCurrency(row[currencyIndex] ?? '');
    const purchaseDate = parseDateValue(row[purchaseDateIndex] ?? '');

    if (!symbol || !shares || shares <= 0 || !avgCost || avgCost <= 0 || !purchaseDate || !isValidPortfolioPurchaseDate(purchaseDate)) {
      skippedRows += 1;
      continue;
    }

    lots.push({
      symbol,
      shares,
      avgCost,
      ...(currency ? { currency } : {}),
      purchaseDate,
    });
  }

  if (!lots.length) {
    throw new Error(
      'No importable lots were found. The file was read, but every row was skipped because the lot data was incomplete or the transactions were unsupported.'
    );
  }

  return {
    lots,
    skippedRows,
    sourceLabel,
  };
}

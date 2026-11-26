import { clamp, readTileTree, removeTile, split, TILE_GAP, tileOrder } from './tileLayout';
import type { TileLayout, TileSizing, TileTree } from './tileLayout';

export const OVERVIEW_CARD_NAMES = {
  summary: 'AI Insights',
  sentiment: 'Market Sentiment',
  indices: 'Major Indices',
  portfolio: 'Portfolio Snapshot',
  watchlist: 'Watchlist',
  sectors: 'Sector Performance',
  gainers: 'Tracked Gainers',
  losers: 'Tracked Losers',
  commodities: 'Commodities',
  fx: 'FX Rates',
  predictions: 'Prediction Markets',
  calendar: 'Economic Events Calendar',
} as const;

export type OverviewCardId = keyof typeof OVERVIEW_CARD_NAMES;
export const OVERVIEW_CARD_IDS = Object.keys(OVERVIEW_CARD_NAMES) as OverviewCardId[];
type Tree = TileTree<OverviewCardId>;
export type OverviewLayout = Omit<TileLayout<OverviewCardId>, 'tree'> & { tree: Tree | null };

const defaultSpans: Record<OverviewCardId, number> = {
  summary: 4, sentiment: 2, indices: 2, portfolio: 2, watchlist: 2, sectors: 2,
  gainers: 1, losers: 1, commodities: 2, fx: 2, predictions: 4, calendar: 4,
};
const minimumWidths: Record<OverviewCardId, number> = {
  summary: 230, sentiment: 245, indices: 260, portfolio: 230, watchlist: 252, sectors: 200,
  gainers: 150, losers: 150, commodities: 175, fx: 175, predictions: 220, calendar: 230,
};
// First paint estimates. The board measures the actual content once each card is mounted.
const typicalHeights: Record<OverviewCardId, number> = {
  summary: 174, sentiment: 274, indices: 276, portfolio: 216, watchlist: 226, sectors: 214,
  gainers: 236, losers: 236, commodities: 156, fx: 156, predictions: 224, calendar: 384,
};
function preferredHeight(id: OverviewCardId, width: number) {
  if (id === 'calendar' && width < 640) return 448;
  return typicalHeights[id];
}
export const OVERVIEW_SIZING: TileSizing<OverviewCardId> = {
  minBoardWidth: 736,
  minWidth: id => minimumWidths[id],
  minHeight: () => 96,
  preferredHeight,
  stackHeight: preferredHeight,
};

const EMPTY_LAYOUT: OverviewLayout = { tree: null, height: 0, stackedHeights: {} };
const MAX_STACK_HEIGHT = 3000;
export const MAX_OVERVIEW_BOARD_HEIGHT = OVERVIEW_CARD_IDS.length * MAX_STACK_HEIGHT;
function isCardId(value: unknown): value is OverviewCardId {
  return OVERVIEW_CARD_IDS.includes(value as OverviewCardId);
}

type WeightedTile = { tree: Tree; size: number };
type LegacyCard = { id: OverviewCardId; span: number; height?: number };
function combine(axis: 'x' | 'y', first: WeightedTile, second: WeightedTile): WeightedTile {
  const size = first.size + second.size;
  return {
    tree: split(axis, first.tree, second.tree, clamp(first.size / size, 0.02, 0.98)),
    size: axis === 'y' ? size + TILE_GAP : size,
  };
}

// The earlier editor stored an ordered array of grid spans. Rebuild its rows
// before converting them to splits, including any explicitly saved card heights.
function fromGrid(cards: LegacyCard[]): OverviewLayout {
  if (!cards.length) return EMPTY_LAYOUT;
  const stackedHeights: OverviewLayout['stackedHeights'] = {};
  const rows: WeightedTile[] = [];
  let row: WeightedTile | undefined;
  let rowHeight = 0;
  for (const { id, span, height } of cards) {
    if (row && row.size + span > 4) {
      rows.push({ tree: row.tree, size: rowHeight });
      row = undefined;
      rowHeight = 0;
    }
    const card = { tree: id, size: span };
    row = row ? combine('x', row, card) : card;
    rowHeight = Math.max(rowHeight, height ?? preferredHeight(id, span * 256));
    if (height !== undefined) stackedHeights[id] = height;
  }
  if (row) rows.push({ tree: row.tree, size: rowHeight });
  const result = rows.reduceRight((below, above) => combine('y', above, below));
  return { tree: result.tree, height: Object.keys(stackedHeights).length ? result.size : 0, stackedHeights };
}

export const DEFAULT_OVERVIEW_LAYOUT = fromGrid(OVERVIEW_CARD_IDS.map(id => ({ id, span: defaultSpans[id] })));

export function normalizeOverviewLayout(value: unknown): OverviewLayout {
  if (Array.isArray(value)) {
    if (!value.length) return EMPTY_LAYOUT;
    const seen = new Set<OverviewCardId>();
    const cards: LegacyCard[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      const { id, span, height } = raw;
      if (!isCardId(id) || seen.has(id)) continue;
      seen.add(id);
      cards.push({
        id, span: Number.isInteger(span) && span >= 1 && span <= 4 ? span : defaultSpans[id],
        height: typeof height === 'number' && Number.isFinite(height) ? clamp(Math.round(height), 128, 1600) : undefined,
      });
    }
    return cards.length ? fromGrid(cards) : DEFAULT_OVERVIEW_LAYOUT;
  }

  if (!value || typeof value !== 'object') return DEFAULT_OVERVIEW_LAYOUT;
  const { tree, height, stackedHeights: rawHeights } = value as Partial<OverviewLayout>;
  if (tree === null) return EMPTY_LAYOUT;
  const root = readTileTree(tree, OVERVIEW_CARD_IDS);
  if (!root) return DEFAULT_OVERVIEW_LAYOUT;
  const stackedHeights: OverviewLayout['stackedHeights'] = {};
  for (const id of tileOrder(root)) {
    const h = rawHeights?.[id];
    if (typeof h === 'number' && Number.isFinite(h)) stackedHeights[id] = clamp(Math.round(h), 96, MAX_STACK_HEIGHT);
  }
  return {
    tree: root,
    height: typeof height === 'number' && Number.isFinite(height) ? clamp(height, 0, MAX_OVERVIEW_BOARD_HEIGHT) : 0,
    stackedHeights,
  };
}

export function overviewCardOrder(layout: OverviewLayout): OverviewCardId[] {
  return layout.tree ? tileOrder(layout.tree) : [];
}

export function addOverviewCard(layout: OverviewLayout, id: OverviewCardId): OverviewLayout {
  if (!layout.tree) return { ...EMPTY_LAYOUT, tree: id };
  if (overviewCardOrder(layout).includes(id)) return layout;
  // Keep the explicit board height stable across repeated add/remove cycles.
  const ratio = layout.height ? clamp(layout.height / (layout.height + typicalHeights[id]), 0.02, 0.98) : 0.5;
  return { ...layout, tree: split('y', layout.tree, id, ratio) };
}

export function removeOverviewCard(layout: OverviewLayout, id: OverviewCardId): OverviewLayout {
  if (!layout.tree || !overviewCardOrder(layout).includes(id)) return layout;
  const tree = removeTile(layout.tree, id);
  if (!tree) return EMPTY_LAYOUT;
  const stackedHeights = { ...layout.stackedHeights };
  delete stackedHeights[id];
  return { ...layout, tree, stackedHeights };
}

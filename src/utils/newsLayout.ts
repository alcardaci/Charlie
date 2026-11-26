import {
  TILE_GAP, clamp, minTileHeight, minTileWidth, positionTiles, readTileTree, split, tileOrder,
  type TileSizing, type TileTree, type TileLayout, type PositionedBoard,
} from './tileLayout';
import type { Drop as TileDrop, Placement as TilePlacement } from './tileLayout';

export { TILE_GAP as NEWS_GAP, clamp, dropTarget as newsDropTarget, dropTile as dropNewsTile, setSplitRatio, tileOrder } from './tileLayout';
export type { Axis, Edge, Rect, Divider } from './tileLayout';

export const NEWS_CARD_NAMES = {
  map: 'Global event map & hotspots', headlines: 'News feed', player: 'Live player', risk: 'Geopolitical risk index',
} as const;
export type NewsCardId = keyof typeof NEWS_CARD_NAMES;
export const NEWS_CARD_IDS = Object.keys(NEWS_CARD_NAMES) as NewsCardId[];
export type NewsTile = TileTree<NewsCardId>;
export type NewsLayout = TileLayout<NewsCardId>;
export type NewsBoard = PositionedBoard<NewsCardId>;
export type Placement = TilePlacement<NewsCardId>;
export type Drop = TileDrop<NewsCardId>;

const minWidths = { map: 275, headlines: 280, player: 200, risk: 280 };
const defaultStackHeight = 430;
export const NEWS_SIZING: TileSizing<NewsCardId> = {
  minBoardWidth: 580,
  minWidth: id => minWidths[id],
  minHeight: (id, width) => {
    if (id === 'risk') return width < 400 ? 345 : 296;
    if (id === 'map') return width < 410 ? 300 : 270;
    return id === 'player' ? 158 : 222;
  },
  stackHeight: (_id, _width, viewportHeight = 0) => {
    const count = NEWS_CARD_IDS.length;
    return Math.max(defaultStackHeight, (viewportHeight - (count - 1) * TILE_GAP) / count);
  },
};

export const DEFAULT_NEWS_LAYOUT: NewsLayout = {
  tree: split('x', 'map', split('x', 'headlines', split('y', 'player', 'risk'), 0.25)),
  height: 0, stackedHeights: {},
};

// The store also saved the factory layout for people who never opened the editor.
const originalDefaultTree = split('y', split('x', 'map', 'headlines'), split('x', 'player', 'risk', 0.43), 0.53);
const equalGridDefaultTree = split('y', split('x', 'map', 'headlines'), split('x', 'player', 'risk'));

function cardId(value: unknown): value is NewsCardId { return NEWS_CARD_IDS.includes(value as NewsCardId); }
// Earlier versions saved ordered width and height presets. Preserve the rows and their relative sizes.
function migrateRows(value: unknown[]): NewsLayout {
  const cards: { id: NewsCardId; full: boolean; height: number }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, width, height } = raw as Record<string, unknown>;
    if (cardId(id) && !cards.some(c => c.id === id)) {
      cards.push({ id, full: width === 'full', height: height === 'tall' ? 688 : height === 'compact' ? 352 : 496 });
    }
  }
  if (!cards.length) return DEFAULT_NEWS_LAYOUT;
  for (const id of NEWS_CARD_IDS) if (!cards.some(c => c.id === id)) cards.push({ id, full: false, height: defaultStackHeight });
  const rows: { tree: NewsTile; height: number }[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i], next = cards[i + 1];
    if (!card.full && next && !next.full) {
      rows.push({ tree: split('x', card.id, next.id), height: Math.max(card.height, next.height) });
      i++;
    } else rows.push({ tree: card.id, height: card.height });
  }
  const combined = rows.reduceRight((below, row) => ({
    tree: split('y', row.tree, below.tree, row.height / (row.height + below.height)), height: row.height + below.height,
  }));
  return { tree: combined.tree, height: 0, stackedHeights: Object.fromEntries(cards.map(c => [c.id, c.height])) };
}
export function normalizeNewsLayout(value: unknown): NewsLayout {
  if (Array.isArray(value)) return migrateRows(value);
  if (!value || typeof value !== 'object') return DEFAULT_NEWS_LAYOUT;
  const { tree, height, stackedHeights } = value as Partial<NewsLayout>;
  const root = readTileTree(tree, NEWS_CARD_IDS);
  if (!root || tileOrder(root).length !== NEWS_CARD_IDS.length) return DEFAULT_NEWS_LAYOUT;
  const heights: NewsLayout['stackedHeights'] = {};
  for (const id of NEWS_CARD_IDS) {
    const h = stackedHeights?.[id];
    if (typeof h === 'number' && Number.isFinite(h)) heights[id] = clamp(h, 150, 3000);
  }
  const boardHeight = typeof height === 'number' && Number.isFinite(height) ? clamp(height, 0, 8000) : 0;
  return { tree: root, height: boardHeight, stackedHeights: heights };
}

export function restoreNewsLayout(value: unknown): NewsLayout {
  const saved = normalizeNewsLayout(value);
  if (!value || typeof value !== 'object' || saved.height || Object.keys(saved.stackedHeights).length) return saved;
  const version = 'version' in value ? value.version : undefined;
  const oldDefault = version === undefined ? originalDefaultTree : version === 1 ? equalGridDefaultTree : null;
  if (oldDefault && JSON.stringify(saved.tree) === JSON.stringify(oldDefault)) return DEFAULT_NEWS_LAYOUT;
  return saved;
}

export function minNewsWidth(tree: NewsTile): number {
  return minTileWidth(tree, NEWS_SIZING);
}

export function minNewsHeight(tree: NewsTile, width: number): number {
  return minTileHeight(tree, width, NEWS_SIZING);
}

export function positionNewsTiles(layout: NewsLayout, width: number, viewportHeight: number): NewsBoard {
  return positionTiles(layout, width, viewportHeight, NEWS_SIZING);
}

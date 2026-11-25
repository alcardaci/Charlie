export const NEWS_CARD_NAMES = {
  map: 'Global event map & hotspots', headlines: 'News feed', player: 'Live player', risk: 'Geopolitical risk index',
} as const;
export type NewsCardId = keyof typeof NEWS_CARD_NAMES;
export const NEWS_CARD_IDS = Object.keys(NEWS_CARD_NAMES) as NewsCardId[];
export type Axis = 'x' | 'y';
export type NewsTile = NewsCardId | { axis: Axis; ratio: number; first: NewsTile; second: NewsTile };
export interface NewsLayout {
  tree: NewsTile;
  height: number;
  stackedHeights: Partial<Record<NewsCardId, number>>;
}
export type Rect = { left: number; top: number; width: number; height: number };
export type Divider = { path: string; axis: Axis; rect: Rect; start: number; size: number; min: number; max: number };
export type Placement = { id: NewsCardId; rect: Rect; edges: Partial<Record<Edge, Divider>> };
export type Edge = 'left' | 'right' | 'top' | 'bottom';
export type Drop = { target: NewsCardId | 'board'; edge: Edge | 'center' };
export const NEWS_GAP = 10;
const minWidths = { map: 275, headlines: 280, player: 200, risk: 280 };
const stackDefaults = { map: 450, headlines: 430, player: 255, risk: 395 };
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const split = (axis: Axis, first: NewsTile, second: NewsTile, ratio = 0.5): NewsTile => ({ axis, first, second, ratio });

export const DEFAULT_NEWS_LAYOUT: NewsLayout = {
  tree: split('y', split('x', 'map', 'headlines'), split('x', 'player', 'risk', 0.43), 0.53),
  height: 0, stackedHeights: {},
};

function cardId(value: unknown): value is NewsCardId { return NEWS_CARD_IDS.includes(value as NewsCardId); }
export function tileOrder(tree: NewsTile): NewsCardId[] {
  return typeof tree === 'string' ? [tree] : [...tileOrder(tree.first), ...tileOrder(tree.second)];
}
function readTree(value: unknown, seen: Set<NewsCardId>, depth = 0): NewsTile | null {
  if (cardId(value) && !seen.has(value)) { seen.add(value); return value; }
  if (!value || typeof value !== 'object' || depth >= NEWS_CARD_IDS.length - 1) return null;
  const { axis, ratio, first, second } = value as Record<string, unknown>;
  if (axis !== 'x' && axis !== 'y') return null;
  const a = readTree(first, seen, depth + 1);
  const b = readTree(second, seen, depth + 1);
  if (!a || !b) return a ?? b;
  return split(axis, a, b, Number.isFinite(ratio) ? clamp(ratio as number, 0.02, 0.98) : 0.5);
}

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
  for (const id of NEWS_CARD_IDS) if (!cards.some(c => c.id === id)) cards.push({ id, full: false, height: stackDefaults[id] });
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
  const seen = new Set<NewsCardId>();
  const root = readTree(tree, seen);
  if (!root || seen.size !== NEWS_CARD_IDS.length) return DEFAULT_NEWS_LAYOUT;
  const heights: NewsLayout['stackedHeights'] = {};
  for (const id of NEWS_CARD_IDS) {
    const h = stackedHeights?.[id];
    if (typeof h === 'number' && Number.isFinite(h)) heights[id] = clamp(h, 150, 3000);
  }
  return { tree: root, height: typeof height === 'number' && Number.isFinite(height) ? clamp(height, 0, 8000) : 0, stackedHeights: heights };
}

function replace(tree: NewsTile, id: NewsCardId, replacement: NewsTile): NewsTile {
  if (typeof tree === 'string') return tree === id ? replacement : tree;
  return { ...tree, first: replace(tree.first, id, replacement), second: replace(tree.second, id, replacement) };
}
function remove(tree: NewsTile, id: NewsCardId): NewsTile | null {
  if (typeof tree === 'string') return tree === id ? null : tree;
  const first = remove(tree.first, id), second = remove(tree.second, id);
  return first && second ? { ...tree, first, second } : first ?? second;
}
export function dropNewsTile(tree: NewsTile, id: NewsCardId, { target, edge }: Drop): NewsTile {
  if (id === target) return tree;
  if (edge === 'center') {
    if (target === 'board') return tree;
    const swap = (node: NewsTile): NewsTile => typeof node === 'string'
      ? node === id ? target : node === target ? id : node
      : { ...node, first: swap(node.first), second: swap(node.second) };
    return swap(tree);
  }
  const rest = remove(tree, id);
  if (!rest) return tree;
  const anchor = target === 'board' ? rest : target;
  const axis = edge === 'left' || edge === 'right' ? 'x' : 'y';
  const insert = edge === 'top' || edge === 'left' ? split(axis, id, anchor) : split(axis, anchor, id);
  return target === 'board' ? insert : replace(rest, target, insert);
}
export function setSplitRatio(tree: NewsTile, path: string, ratio: number): NewsTile {
  if (typeof tree === 'string') return tree;
  if (!path) return { ...tree, ratio: clamp(ratio, 0.02, 0.98) };
  const branch = path[0] === '0' ? 'first' : 'second';
  return { ...tree, [branch]: setSplitRatio(tree[branch], path.slice(1), ratio) };
}
export function minNewsWidth(tree: NewsTile): number {
  if (typeof tree === 'string') return minWidths[tree];
  const a = minNewsWidth(tree.first), b = minNewsWidth(tree.second);
  return tree.axis === 'x' ? a + NEWS_GAP + b : Math.max(a, b);
}
export function minNewsHeight(tree: NewsTile, width: number): number {
  if (typeof tree === 'string') {
    if (tree === 'risk') return width < 400 ? 345 : 296;
    if (tree === 'map') return width < 410 ? 300 : 270;
    return tree === 'player' ? 158 : 222;
  }
  if (tree.axis === 'y') return minNewsHeight(tree.first, width) + NEWS_GAP + minNewsHeight(tree.second, width);
  const available = width - NEWS_GAP;
  const firstWidth = clamp(available * tree.ratio, minNewsWidth(tree.first), available - minNewsWidth(tree.second));
  return Math.max(minNewsHeight(tree.first, firstWidth), minNewsHeight(tree.second, available - firstWidth));
}

// Split the measured workspace into adjoining rectangles. Each split consumes all its available space.
export function positionNewsTiles(layout: NewsLayout, width: number, viewportHeight: number) {
  const tiles: Placement[] = [];
  const dividers: Divider[] = [];
  const stacked = width < Math.max(580, minNewsWidth(layout.tree));
  let height = Math.max(layout.height, viewportHeight, minNewsHeight(layout.tree, Math.max(width, minNewsWidth(layout.tree))));
  if (stacked) {
    let top = 0;
    for (const id of tileOrder(layout.tree)) {
      const h = Math.max(minNewsHeight(id, width), layout.stackedHeights[id] ?? stackDefaults[id]);
      tiles.push({ id, rect: { left: 0, top, width, height: h }, edges: {} });
      top += h + NEWS_GAP;
    }
    const last = tiles[tiles.length - 1];
    const total = top - NEWS_GAP;
    height = Math.max(total, viewportHeight);
    last.rect.height += height - total;
  } else {
    const place = (node: NewsTile, rect: Rect, path: string, edges: Placement['edges']) => {
      if (typeof node === 'string') { tiles.push({ id: node, rect, edges }); return; }
      const horizontal = node.axis === 'x';
      const dimension = horizontal ? 'width' : 'height';
      const position = horizontal ? 'left' : 'top';
      const size = rect[dimension] - NEWS_GAP;
      const min = horizontal ? minNewsWidth(node.first) : minNewsHeight(node.first, rect.width);
      const max = size - (horizontal ? minNewsWidth(node.second) : minNewsHeight(node.second, rect.width));
      const firstSize = clamp(Math.round(size * node.ratio), min, max);
      const gapStart = rect[position] + firstSize;
      const divider = { path, axis: node.axis, rect: { ...rect, [position]: gapStart, [dimension]: NEWS_GAP }, start: rect[position], size, min, max };
      dividers.push(divider);
      place(node.first, { ...rect, [dimension]: firstSize }, path + '0', { ...edges, [horizontal ? 'right' : 'bottom']: divider });
      place(node.second, { ...rect, [position]: gapStart + NEWS_GAP, [dimension]: size - firstSize }, path + '1', { ...edges, [horizontal ? 'left' : 'top']: divider });
    };
    place(layout.tree, { left: 0, top: 0, width, height }, '', {});
  }
  return { height, stacked, tiles, dividers };
}
export type NewsBoard = ReturnType<typeof positionNewsTiles>;

export function newsDropTarget(board: NewsBoard, id: NewsCardId, x: number, y: number): Drop | null {
  const width = Math.max(...board.tiles.map(t => t.rect.left + t.rect.width));
  if (x < 0 || y < 0 || x > width || y > board.height) return null;
  if (y < 18) return { target: 'board', edge: 'top' };
  if (y > board.height - 18) return { target: 'board', edge: 'bottom' };
  if (!board.stacked && (x < 18 || x > width - 18)) return { target: 'board', edge: x < 18 ? 'left' : 'right' };
  const tile = board.tiles.find(({ rect: r }) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height);
  if (!tile || tile.id === id) return null;
  const r = tile.rect;
  const edges: [Edge, number][] = [['top', (y - r.top) / r.height], ['bottom', (r.top + r.height - y) / r.height]];
  if (!board.stacked) edges.push(['left', (x - r.left) / r.width], ['right', (r.left + r.width - x) / r.width]);
  const [edge, distance] = edges.sort((a, b) => a[1] - b[1])[0];
  return { target: tile.id, edge: distance < 0.19 ? edge : 'center' };
}

export type Axis = 'x' | 'y';
export type Edge = 'left' | 'right' | 'top' | 'bottom';
export type TileTree<Id extends string> = Id | { axis: Axis; ratio: number; first: TileTree<Id>; second: TileTree<Id> };
export interface TileLayout<Id extends string> {
  tree: TileTree<Id>;
  height: number;
  stackedHeights: Partial<Record<Id, number>>;
}
export interface TileSizing<Id extends string> {
  minBoardWidth: number;
  minWidth: (id: Id) => number;
  minHeight: (id: Id, width: number) => number;
  stackHeight: (id: Id, width: number, viewportHeight?: number) => number;
  /** When height is automatic, vertical splits follow the natural heights of their contents. */
  preferredHeight?: (id: Id, width: number) => number;
}
export type Rect = { left: number; top: number; width: number; height: number };
export type Divider = { path: string; axis: Axis; rect: Rect; start: number; size: number; min: number; max: number };
export type Placement<Id extends string> = { id: Id; rect: Rect; edges: Partial<Record<Edge, Divider>> };
export type Drop<Id extends string> = { target: Id | 'board'; edge: Edge | 'center' };
export interface PositionedBoard<Id extends string> {
  height: number;
  stacked: boolean;
  tiles: Placement<Id>[];
  dividers: Divider[];
}

export const TILE_GAP = 10;
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function split<Id extends string>(axis: Axis, first: TileTree<Id>, second: TileTree<Id>, ratio = 0.5): TileTree<Id> {
  return { axis, first, second, ratio };
}

export function tileOrder<Id extends string>(tree: TileTree<Id>): Id[] {
  return typeof tree === 'string' ? [tree] : [...tileOrder(tree.first), ...tileOrder(tree.second)];
}

export function readTileTree<Id extends string>(value: unknown, ids: readonly Id[]): TileTree<Id> | null {
  const seen = new Set<Id>();
  function read(node: unknown, depth: number): TileTree<Id> | null {
    if (typeof node === 'string' && ids.includes(node as Id) && !seen.has(node as Id)) {
      seen.add(node as Id);
      return node as Id;
    }
    if (!node || typeof node !== 'object' || depth >= ids.length - 1) return null;
    const { axis, ratio, first, second } = node as Record<string, unknown>;
    if (axis !== 'x' && axis !== 'y') return null;
    const a = read(first, depth + 1);
    const b = read(second, depth + 1);
    if (!a || !b) return a ?? b;
    return split(axis, a, b, typeof ratio === 'number' && Number.isFinite(ratio) ? clamp(ratio, 0.02, 0.98) : 0.5);
  }
  return read(value, 0);
}

function replaceTile<Id extends string>(tree: TileTree<Id>, id: Id, replacement: TileTree<Id>): TileTree<Id> {
  if (typeof tree === 'string') return tree === id ? replacement : tree;
  return { ...tree, first: replaceTile(tree.first, id, replacement), second: replaceTile(tree.second, id, replacement) };
}
export function removeTile<Id extends string>(tree: TileTree<Id>, id: Id): TileTree<Id> | null {
  if (typeof tree === 'string') return tree === id ? null : tree;
  const first = removeTile(tree.first, id), second = removeTile(tree.second, id);
  return first && second ? { ...tree, first, second } : first ?? second;
}
export function dropTile<Id extends string>(tree: TileTree<Id>, id: Id, { target, edge }: Drop<Id>): TileTree<Id> {
  if (id === target) return tree;
  if (edge === 'center') {
    if (target === 'board') return tree;
    const swap = (node: TileTree<Id>): TileTree<Id> => typeof node === 'string'
      ? node === id ? target : node === target ? id : node
      : { ...node, first: swap(node.first), second: swap(node.second) };
    return swap(tree);
  }
  const rest = removeTile(tree, id);
  if (!rest) return tree;
  const anchor = target === 'board' ? rest : target;
  const axis = edge === 'left' || edge === 'right' ? 'x' : 'y';
  const insert = edge === 'top' || edge === 'left' ? split(axis, id, anchor) : split(axis, anchor, id);
  return target === 'board' ? insert : replaceTile(rest, target, insert);
}
export function setSplitRatio<Id extends string>(tree: TileTree<Id>, path: string, ratio: number): TileTree<Id> {
  if (typeof tree === 'string') return tree;
  if (!path) return { ...tree, ratio: clamp(ratio, 0.02, 0.98) };
  const branch = path[0] === '0' ? 'first' : 'second';
  return { ...tree, [branch]: setSplitRatio(tree[branch], path.slice(1), ratio) };
}
export function minTileWidth<Id extends string>(tree: TileTree<Id>, sizing: TileSizing<Id>): number {
  if (typeof tree === 'string') return sizing.minWidth(tree);
  const first = minTileWidth(tree.first, sizing), second = minTileWidth(tree.second, sizing);
  return tree.axis === 'x' ? first + TILE_GAP + second : Math.max(first, second);
}

function treeHeight<Id extends string>(
  tree: TileTree<Id>, width: number, sizing: TileSizing<Id>, preferred?: TileSizing<Id>['preferredHeight'],
): number {
  if (typeof tree === 'string') {
    const min = sizing.minHeight(tree, width);
    return preferred ? Math.max(min, preferred(tree, width)) : min;
  }
  if (tree.axis === 'y') {
    return treeHeight(tree.first, width, sizing, preferred) + TILE_GAP + treeHeight(tree.second, width, sizing, preferred);
  }
  const available = width - TILE_GAP;
  const firstWidth = clamp(Math.round(available * tree.ratio), minTileWidth(tree.first, sizing), available - minTileWidth(tree.second, sizing));
  return Math.max(treeHeight(tree.first, firstWidth, sizing, preferred), treeHeight(tree.second, available - firstWidth, sizing, preferred));
}

export function minTileHeight<Id extends string>(tree: TileTree<Id>, width: number, sizing: TileSizing<Id>): number {
  return treeHeight(tree, width, sizing);
}

// Partition the board into adjoining rectangles. Divider paths are stable addresses in the tree.
export function positionTiles<Id extends string>(
  layout: TileLayout<Id>, width: number, viewportHeight: number, sizing: TileSizing<Id>,
): PositionedBoard<Id> {
  const tiles: Placement<Id>[] = [];
  const dividers: Divider[] = [];
  const stacked = width < Math.max(sizing.minBoardWidth, minTileWidth(layout.tree, sizing));
  let height: number;
  if (stacked) {
    let top = 0;
    for (const id of tileOrder(layout.tree)) {
      const autoHeight = sizing.preferredHeight ?? sizing.stackHeight;
      const h = Math.max(sizing.minHeight(id, width), layout.stackedHeights[id] ?? autoHeight(id, width, viewportHeight));
      tiles.push({ id, rect: { left: 0, top, width, height: h }, edges: {} });
      top += h + TILE_GAP;
    }
    const total = top - TILE_GAP;
    height = Math.max(total, viewportHeight);
    tiles[tiles.length - 1].rect.height += height - total;
  } else {
    const preferredHeight = layout.height === 0 ? sizing.preferredHeight : undefined;
    height = Math.max(layout.height, viewportHeight, treeHeight(layout.tree, width, sizing, preferredHeight));
    const root = layout.tree;
    if (!layout.height && !preferredHeight && typeof root !== 'string' && root.axis === 'y' && root.ratio === 0.5) {
      // On short screens, grow the board enough to keep two equal rows usable.
      const rowMinimum = Math.max(minTileHeight(root.first, width, sizing), minTileHeight(root.second, width, sizing));
      height = Math.max(height, 2 * rowMinimum + TILE_GAP);
    }
    const place = (node: TileTree<Id>, rect: Rect, path: string, edges: Placement<Id>['edges']) => {
      if (typeof node === 'string') { tiles.push({ id: node, rect, edges }); return; }
      const horizontal = node.axis === 'x';
      const dimension = horizontal ? 'width' : 'height';
      const position = horizontal ? 'left' : 'top';
      const size = rect[dimension] - TILE_GAP;
      const min = horizontal ? minTileWidth(node.first, sizing) : minTileHeight(node.first, rect.width, sizing);
      const max = size - (horizontal ? minTileWidth(node.second, sizing) : minTileHeight(node.second, rect.width, sizing));
      let ratio = node.ratio;
      if (!horizontal && preferredHeight) {
        const first = treeHeight(node.first, rect.width, sizing, preferredHeight);
        const second = treeHeight(node.second, rect.width, sizing, preferredHeight);
        ratio = first / (first + second);
      }
      const firstSize = clamp(Math.round(size * ratio), min, max);
      const gapStart = rect[position] + firstSize;
      const divider = { path, axis: node.axis, rect: { ...rect, [position]: gapStart, [dimension]: TILE_GAP }, start: rect[position], size, min, max };
      dividers.push(divider);
      place(node.first, { ...rect, [dimension]: firstSize }, path + '0', { ...edges, [horizontal ? 'right' : 'bottom']: divider });
      place(node.second, { ...rect, [position]: gapStart + TILE_GAP, [dimension]: size - firstSize }, path + '1', { ...edges, [horizontal ? 'left' : 'top']: divider });
    };
    place(layout.tree, { left: 0, top: 0, width, height }, '', {});
  }
  return { height, stacked, tiles, dividers };
}

export function dropTarget<Id extends string>(board: PositionedBoard<Id>, id: Id, x: number, y: number): Drop<Id> | null {
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

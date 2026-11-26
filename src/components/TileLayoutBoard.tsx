import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { GripVertical, MoveDiagonal2, MoveHorizontal, MoveVertical, Settings2, X } from 'lucide-react';
import {
  clamp, dropTile, dropTarget, minTileHeight, minTileWidth, positionTiles, setSplitRatio, tileOrder, TILE_GAP,
  type Divider, type Drop, type Placement, type PositionedBoard, type Rect, type TileLayout, type TileSizing,
} from '../utils/tileLayout';

export function TileLayoutHint({ id }: { id: string }) {
  return <p id={id} className="min-w-0 flex-[1_1_18rem] text-[11px] text-terminal-muted">
    Drag onto a card to swap, or to an edge to place it there. Drag a corner or divider to resize.
    <span className="sr-only"> Use arrow keys on a move or resize control. Escape cancels.</span>
  </p>;
}

const action = 'rounded border border-terminal-border px-2 py-1 text-xs text-terminal-muted hover:border-terminal-accent hover:text-terminal-text';
export function TileLayoutActions({ editing, onEdit, onReset, onCancel, onSave }: {
  editing: boolean; onEdit: () => void; onReset: () => void; onCancel: () => void; onSave: () => void;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    {editing ? <>
      <button type="button" className={action} onClick={onReset}>Reset to default</button>
      <button type="button" className={action} onClick={onCancel}>Cancel</button>
      <button type="button" className={action} onClick={onSave}>Save layout</button>
    </> : <button type="button" className={'inline-flex items-center gap-1.5 ' + action} onClick={onEdit}><Settings2 size={13} />Edit layout</button>}
  </div>;
}

type Resize<Id extends string> = { x?: Divider; y?: Divider; stack?: Placement<Id>; bottom?: boolean };
type Gesture<Id extends string> = {
  pointer: number; x: number; y: number; layout: TileLayout<Id>; board: PositionedBoard<Id>;
  card?: Id; resize?: Resize<Id>; moved: boolean;
};
function resizeLayout<Id extends string>(
  layout: TileLayout<Id>, board: PositionedBoard<Id>, handles: Resize<Id>, dx: number, dy: number,
  heightFloor: number, maxBoardHeight: number, sizing: TileSizing<Id>,
): TileLayout<Id> {
  if (handles.stack) {
    const { id, rect } = handles.stack;
    return { ...layout, stackedHeights: { ...layout.stackedHeights, [id]: clamp(rect.height + dy, minTileHeight(id, rect.width, sizing), 3000) } };
  }
  let tree = layout.tree, height = layout.height;
  if (sizing.preferredHeight && !layout.height && dy && (handles.y || handles.bottom)) {
    // Once a row is resized, keep the proportions that were visible before the drag.
    height = board.height;
    for (const d of board.dividers) {
      if (d.axis === 'y' && d.size > 0) tree = setSplitRatio(tree, d.path, (d.rect.top - d.start) / d.size);
    }
  }
  if (handles.bottom && dy) {
    const width = Math.max(...board.tiles.map(t => t.rect.left + t.rect.width));
    height = clamp(board.height + dy, Math.max(heightFloor, minTileHeight(tree, width, sizing)), Math.max(board.height, maxBoardHeight));
    // Keep every upper row in place when extending the lower edge of the workspace.
    const delta = height - board.height;
    for (const d of board.dividers) {
      if (d.axis === 'y' && Math.abs(d.start + d.size + TILE_GAP - board.height) < 1) {
        tree = setSplitRatio(tree, d.path, (d.rect.top - d.start) / (d.size + delta));
      }
    }
  }
  for (const d of [handles.x, handles.y]) {
    if (!d || !(d.axis === 'x' ? dx : dy)) continue;
    const requested = (d.axis === 'x' ? d.rect.left + dx : d.rect.top + dy) - d.start;
    const extra = d.axis === 'y' && !d.path ? clamp(requested - d.max, 0, Math.max(0, maxBoardHeight - board.height)) : 0;
    if (extra) height = board.height + extra;
    tree = setSplitRatio(tree, d.path, clamp(requested, d.min, d.max + extra) / (d.size + extra));
  }
  return { ...layout, tree, height };
}
function previewRect<Id extends string>(drop: Drop<Id>, r: Rect): Rect {
  if (drop.edge === 'center') return r;
  const horizontal = drop.edge === 'left' || drop.edge === 'right';
  const size = horizontal ? 'width' : 'height', start = horizontal ? 'left' : 'top';
  const half = (r[size] - TILE_GAP) / 2;
  return { ...r, [size]: half, [start]: r[start] + (drop.edge === 'right' || drop.edge === 'bottom' ? half + TILE_GAP : 0) };
}

function sectionRules<Id extends string>(board: PositionedBoard<Id>, showColumnRules: boolean) {
  const halfGap = TILE_GAP / 2;
  if (board.stacked) {
    return board.tiles.slice(1).map(({ id, rect }) => ({
      key: id, rect: { ...rect, top: rect.top - halfGap, height: 1 },
    }));
  }
  const dividers = showColumnRules ? board.dividers : board.dividers.filter(divider => divider.axis === 'y');
  return dividers.map(({ path, rect, axis }) => ({
    key: path, rect: axis === 'x'
      ? { ...rect, left: rect.left + halfGap, width: 1 }
      : { ...rect, top: rect.top + halfGap, height: 1 },
  }));
}
const dropLabels = { center: 'Swap with', left: 'Place left of', right: 'Place right of', top: 'Place above', bottom: 'Place below' };
const boardDropLabels = { left: 'Full-height column on the left', right: 'Full-height column on the right', top: 'Full-width row at the top', bottom: 'Full-width row at the bottom', center: '' };

type BoardProps<Id extends string> = {
  layout: TileLayout<Id>;
  sizing: TileSizing<Id>;
  names: Readonly<Record<Id, string>>;
  viewport: RefObject<HTMLDivElement>;
  editing: boolean;
  onChange: (layout: TileLayout<Id>) => void;
  renderCard: (id: Id) => ReactNode;
  hintId: string;
  onRemove?: (id: Id) => void;
  active?: boolean;
  keepMounted?: Id;
  autoSizeContent?: boolean;
  showColumnRules?: boolean;
  maxBoardHeight?: number;
};

export function TileLayoutBoard<Id extends string>({
  layout, sizing, names, viewport, editing, onChange, renderCard, hintId,
  onRemove, active = true, keepMounted, autoSizeContent = false, showColumnRules = true, maxBoardHeight = 8000,
}: BoardProps<Id>) {
  const [destination, setDestination] = useState<Drop<Id> | null>(null);
  const [dragging, setDragging] = useState<Id | null>(null);
  const [moveBoard, setMoveBoard] = useState<PositionedBoard<Id> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture<Id> | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scrollFrame = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [naturalHeights, setNaturalHeights] = useState<Partial<Record<Id, number>>>({});
  const order = tileOrder(layout.tree);
  const cardList = order.join('|');
  const metrics = autoSizeContent
    ? { ...sizing, preferredHeight: (id: Id, width: number) => naturalHeights[id] ?? sizing.preferredHeight?.(id, width) ?? sizing.stackHeight(id, width) }
    : sizing;
  const heightFloor = autoSizeContent ? 0 : size.height;
  // Keep the drop targets under the pointer while live data changes a card's natural height.
  const board = (editing && moveBoard) || positionTiles(layout, size.width, heightFloor, metrics);
  const contentRef = useCallback((node: HTMLDivElement | null) => { if (node) node.inert = editing; }, [editing]);

  useLayoutEffect(() => {
    const boardEl = surface.current;
    if (!active || !boardEl) return;
    let observedViewport: HTMLElement | null = null;
    const measure = () => {
      // The board is ready before first paint. Its parent's ref can arrive one commit phase later.
      if (viewport.current && viewport.current !== observedViewport) {
        observedViewport = viewport.current;
        observer.observe(observedViewport);
      }
      const width = boardEl.clientWidth, height = observedViewport?.clientHeight ?? 0;
      setSize(prev => prev.width === width && prev.height === height ? prev : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(boardEl);
    measure();
    return () => observer.disconnect();
  }, [active, viewport]);
  useLayoutEffect(() => {
    if (!active || !autoSizeContent || !surface.current) return;
    const bodies = Array.from(surface.current.querySelectorAll<HTMLElement>('.tile-layout-natural'));
    const measure = () => {
      const next: Partial<Record<Id, number>> = {};
      for (const body of bodies) {
        const height = Math.ceil(body.getBoundingClientRect().height);
        if (height) next[body.dataset.contentId as Id] = height;
      }
      setNaturalHeights(prev => bodies.every(body => {
        const id = body.dataset.contentId as Id;
        return prev[id] === next[id];
      }) ? prev : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    bodies.forEach(body => observer.observe(body));
    return () => observer.disconnect();
  }, [active, autoSizeContent, cardList]);
  useEffect(() => {
    if (!editing) { setMoveBoard(null); setDestination(null); setDragging(null); setAnnouncement(''); }
    return () => { gesture.current = null; cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; };
  }, [editing]);

  function targetAt(g: Gesture<Id>, clientX: number, clientY: number) {
    const r = surface.current?.getBoundingClientRect(), view = viewport.current?.getBoundingClientRect();
    if (!r || !view || !g.card || clientY < view.top || clientY > view.bottom) return null;
    const drop = dropTarget(g.board, g.card, clientX - r.left, clientY - r.top);
    if (drop && !g.board.stacked && (drop.edge === 'left' || drop.edge === 'right') &&
      minTileWidth(dropTile(g.layout.tree, g.card, drop), sizing) > r.width) {
      return drop.target === 'board' ? null : { target: drop.target, edge: 'center' } as Drop<Id>;
    }
    return drop;
  }
  function showDestination(g: Gesture<Id>) {
    const dest = targetAt(g, pointer.current.x, pointer.current.y);
    setDestination(prev => prev?.edge === dest?.edge && prev?.target === dest?.target ? prev : dest);
  }
  function scrollDuringDrag() {
    scrollFrame.current = 0;
    const el = viewport.current, g = gesture.current;
    if (!el || !g?.card || !g.moved) return;
    const r = el.getBoundingClientRect(), p = pointer.current;
    const edge = 46;
    const speed = p.y < r.top + edge ? -Math.ceil((r.top + edge - p.y) / 3) : Math.ceil(Math.max(0, p.y - r.bottom + edge) / 3);
    if (speed && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
      const before = el.scrollTop;
      el.scrollTop += clamp(speed, -17, 17);
      if (before !== el.scrollTop) { showDestination(g); scrollFrame.current = requestAnimationFrame(scrollDuringDrag); }
    }
  }
  function begin(e: PointerEvent<HTMLElement>, card?: Id, resize?: Resize<Id>) {
    const r = surface.current?.getBoundingClientRect();
    if (!editing || !r || !e.isPrimary || e.button !== 0 || gesture.current) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { pointer: e.pointerId, card, resize, board, layout, x: e.clientX - r.left, y: e.clientY - r.top, moved: false };
    if (card) setMoveBoard(board);
  }
  function move(e: PointerEvent) {
    const g = gesture.current, r = surface.current?.getBoundingClientRect();
    if (!g || g.pointer !== e.pointerId || !r) return;
    const dx = e.clientX - r.left - g.x, dy = e.clientY - r.top - g.y;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    g.moved = true;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (g.resize) onChange(resizeLayout(g.layout, g.board, g.resize, dx, dy, heightFloor, maxBoardHeight, metrics));
    else if (g.card) {
      setDragging(g.card); showDestination(g);
      if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(scrollDuringDrag);
    }
  }
  function end(e?: PointerEvent, cancelled = false) {
    const g = gesture.current;
    if (!g || (e && g.pointer !== e.pointerId)) return;
    gesture.current = null;
    setMoveBoard(null);
    cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0;
    if (cancelled && g.resize) onChange(g.layout);
    else if (e && g.moved && !cancelled) {
      if (g.card) {
        const d = targetAt(g, e.clientX, e.clientY);
        if (d) {
          onChange({ ...g.layout, tree: dropTile(g.layout.tree, g.card, d) });
          setAnnouncement(names[g.card] + ' moved.');
        }
      } else if (g.resize && surface.current) {
        const r = surface.current.getBoundingClientRect();
        onChange(resizeLayout(g.layout, g.board, g.resize, e.clientX - r.left - g.x, e.clientY - r.top - g.y, heightFloor, maxBoardHeight, metrics));
      }
    }
    setDragging(null); setDestination(null);
  }
  function keyControl(e: KeyboardEvent, tile?: Placement<Id>, resize?: Resize<Id>) {
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const step = e.shiftKey ? 60 : 16;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (resize) { onChange(resizeLayout(layout, board, resize, dx, dy, heightFloor, maxBoardHeight, metrics)); return; }
    if (!tile) return;
    const { left, top, width, height } = tile.rect;
    const options = board.tiles.filter(t => t.id !== tile.id).map(t => {
      const x = t.rect.left + t.rect.width / 2 - left - width / 2;
      const y = t.rect.top + t.rect.height / 2 - top - height / 2;
      return { id: t.id, forward: dx ? x * Math.sign(dx) : y * Math.sign(dy), across: Math.abs(dx ? y : x) };
    }).filter(t => t.forward > 1).sort((a, b) => a.across + a.forward - b.across - b.forward);
    const target = options[0]?.id;
    if (target) {
      const handle = e.currentTarget;
      onChange({ ...layout, tree: dropTile(layout.tree, tile.id, { target, edge: 'center' }) });
      setAnnouncement('Swapped with ' + names[target]);
      requestAnimationFrame(() => {
        if (handle instanceof HTMLElement && handle.isConnected) {
          handle.focus({ preventScroll: true });
          handle.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    }
  }

  const targetRect = destination?.target === 'board'
    ? { left: 0, top: 0, width: size.width, height: board.height }
    : board.tiles.find(t => t.id === destination?.target)?.rect;
  const hint = destination && targetRect && previewRect(destination, targetRect);

  // The floating News player stays in the same DOM position when its workspace is hidden or rearranged.
  const renderOrder = keepMounted
    ? (Object.keys(names) as Id[]).filter(id => order.includes(id) && (active || id === keepMounted))
    : order;
  return (
    <div ref={surface} className={active ? 'relative w-full' : 'contents'} style={active ? { height: board.height } : undefined}
      onKeyDown={e => {
        if (e.key === 'Escape' && gesture.current) { e.preventDefault(); e.stopPropagation(); end(undefined, true); }
      }}
      onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)}>
      {renderOrder.map(id => {
        const tile = board.tiles.find(t => t.id === id)!;
        const { edges } = tile, title = names[id];
        const resize: Resize<Id> = board.stacked ? { stack: tile } : { x: edges.right ?? edges.left, y: edges.bottom ?? edges.top, bottom: !edges.bottom && !edges.top };
        const left = !edges.right && !!edges.left, top = !edges.bottom && !!edges.top;
        const diagonal = Boolean(resize.x && (resize.y || resize.bottom));
        const ResizeIcon = diagonal ? MoveDiagonal2 : resize.x ? MoveHorizontal : MoveVertical;
        const cursor = diagonal ? (left === top ? 'cursor-nwse-resize' : 'cursor-nesw-resize') : resize.x ? 'cursor-ew-resize' : 'cursor-ns-resize';
        return <section key={id} aria-label={title} data-card-id={id} data-fixed-height={(board.stacked ? layout.stackedHeights[id] != null : layout.height > 0) || undefined} className={active ? 'absolute min-w-0' : 'contents'} style={active ? tile.rect : undefined}>
          <div ref={contentRef} className={active ? 'tile-layout-content h-full' + (autoSizeContent ? ' overflow-auto' : '') : 'contents'}>
            {autoSizeContent ? <div data-content-id={id} className="tile-layout-natural flow-root">{renderCard(id)}</div> : renderCard(id)}
          </div>
          {active && editing && <>
            <button type="button" aria-label={'Move ' + title} aria-describedby={hintId}
              className={'tile-move-handle ' + (dragging === id ? 'tile-moving' : '')}
              onPointerDown={e => begin(e, id)} onKeyDown={e => keyControl(e, tile)}>
              <span><GripVertical size={17} />Move</span>
            </button>
            {onRemove && <button type="button" aria-label={'Remove ' + title} title={'Remove ' + title}
              className="tile-remove-button" style={{ [top && !left ? 'left' : 'right']: 3 }}
              onClick={() => { onRemove(id); setAnnouncement(title + ' removed.'); }}><X size={15} /></button>}
            <button type="button" aria-label={'Resize ' + title} aria-describedby={hintId}
              className={'tile-resize-corner ' + cursor}
              style={{ [left ? 'left' : 'right']: 3, [top ? 'top' : 'bottom']: 3 }}
              onPointerDown={e => begin(e, undefined, resize)} onKeyDown={e => keyControl(e, tile, resize)}>
              <ResizeIcon size={17} style={{ transform: diagonal && left !== top ? 'scaleX(-1)' : undefined }} />
            </button>
          </>}
        </section>;
      })}
      {active && <span className="sr-only" aria-live="polite">{announcement}</span>}
      {active && sectionRules(board, showColumnRules).map(rule => (
        <span key={rule.key} aria-hidden="true" className="tile-section-rule pointer-events-none absolute" style={rule.rect} />
      ))}
      {active && editing && !board.stacked && board.dividers.map(d => {
        const handles = { [d.axis]: d };
        return <button key={d.path} type="button" aria-label={'Resize ' + (d.axis === 'x' ? 'columns' : 'rows') + ' between cards'}
          className={'tile-divider ' + (d.axis === 'x' ? 'tile-divider-x' : 'tile-divider-y')} style={d.rect}
          onPointerDown={e => begin(e, undefined, handles)} onKeyDown={e => keyControl(e, undefined, handles)} />;
      })}
      {active && editing && !board.stacked && <button type="button" aria-label="Resize workspace bottom edge"
        className="tile-divider tile-divider-y bottom-0 left-1/4 h-2 w-1/2" onPointerDown={e => begin(e, undefined, { bottom: true })}
        onKeyDown={e => keyControl(e, undefined, { bottom: true })} />}
      {active && destination && hint && <div aria-hidden="true" className="tile-drop-preview" style={hint}>
        <span>{destination.target === 'board' ? boardDropLabels[destination.edge] : dropLabels[destination.edge] + ' ' + names[destination.target]}</span>
      </div>}
    </div>
  );
}

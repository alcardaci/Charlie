import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { GripVertical, MoveDiagonal2, MoveHorizontal, MoveVertical, Settings2 } from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';
import {
  clamp, DEFAULT_NEWS_LAYOUT, dropNewsTile, minNewsHeight, minNewsWidth, NEWS_CARD_IDS, NEWS_CARD_NAMES,
  NEWS_GAP, newsDropTarget, positionNewsTiles, setSplitRatio,
} from '../utils/newsLayout';
import type { Divider, Drop, NewsBoard, NewsCardId, NewsLayout, Placement, Rect } from '../utils/newsLayout';
import { CharlieLivePlayer } from './CharlieLivePlayer';
import { NewsPanel } from './NewsPanel';
import { PanelBoundary } from './PanelBoundary';
import { WorkspaceHeader } from './WorkspaceHeader';

const EventCard = lazy(() => import('../panels/GeopoliticsPanel').then(m => ({ default: m.NewsEventCard })));
const RiskCard = lazy(() => import('../panels/GeopoliticsPanel').then(m => ({ default: m.NewsRiskCard })));
const action = 'rounded border border-terminal-border px-2 py-1 text-xs text-terminal-muted hover:border-terminal-accent hover:text-terminal-text';
const NewsContent = memo(function NewsContent({ id, active }: { id: NewsCardId; active: boolean }) {
  if (id === 'player') return <CharlieLivePlayer embedded={active} />;
  return <PanelBoundary><Suspense fallback={<div className="shimmer h-full rounded" />}>
    {id === 'map' ? <EventCard /> : id === 'risk' ? <RiskCard /> : <NewsPanel embedded />}
  </Suspense></PanelBoundary>;
});

type Resize = { x?: Divider; y?: Divider; stack?: Placement; bottom?: boolean };
type Gesture = {
  pointer: number; x: number; y: number; layout: NewsLayout; board: NewsBoard;
  card?: NewsCardId; resize?: Resize; moved: boolean;
};
function resizeLayout(layout: NewsLayout, board: NewsBoard, handles: Resize, dx: number, dy: number, viewportHeight: number): NewsLayout {
  if (handles.stack) {
    const { id, rect } = handles.stack;
    return { ...layout, stackedHeights: { ...layout.stackedHeights, [id]: clamp(rect.height + dy, minNewsHeight(id, rect.width), 3000) } };
  }
  let tree = layout.tree, height = layout.height;
  if (handles.bottom) {
    height = clamp(board.height + dy, Math.max(viewportHeight, minNewsHeight(tree, Math.max(...board.tiles.map(t => t.rect.left + t.rect.width)))), 8000);
    // Keep every upper row in place when extending the lower edge of the workspace.
    const delta = height - board.height;
    for (const d of board.dividers) {
      if (d.axis === 'y' && Math.abs(d.start + d.size + NEWS_GAP - board.height) < 1) {
        tree = setSplitRatio(tree, d.path, (d.rect.top - d.start) / (d.size + delta));
      }
    }
  }
  for (const d of [handles.x, handles.y]) {
    if (!d) continue;
    const requested = (d.axis === 'x' ? d.rect.left + dx : d.rect.top + dy) - d.start;
    const extra = d.axis === 'y' && !d.path ? clamp(requested - d.max, 0, Math.max(0, 8000 - board.height)) : 0;
    if (extra) height = board.height + extra;
    tree = setSplitRatio(tree, d.path, clamp(requested, d.min, d.max + extra) / (d.size + extra));
  }
  return { ...layout, tree, height };
}
function previewRect(drop: Drop, r: Rect): Rect {
  if (drop.edge === 'center') return r;
  const horizontal = drop.edge === 'left' || drop.edge === 'right';
  const size = horizontal ? 'width' : 'height', start = horizontal ? 'left' : 'top';
  const half = (r[size] - NEWS_GAP) / 2;
  return { ...r, [size]: half, [start]: r[start] + (drop.edge === 'right' || drop.edge === 'bottom' ? half + NEWS_GAP : 0) };
}

function sectionRules(board: NewsBoard) {
  const halfGap = NEWS_GAP / 2;
  if (board.stacked) {
    return board.tiles.slice(1).map(({ id, rect }) => ({
      key: id, rect: { ...rect, top: rect.top - halfGap, height: 1 },
    }));
  }
  return board.dividers.map(({ path, rect, axis }) => ({
    key: path, rect: axis === 'x'
      ? { ...rect, left: rect.left + halfGap, width: 1 }
      : { ...rect, top: rect.top + halfGap, height: 1 },
  }));
}
const dropLabels = { center: 'Swap with', left: 'Place left of', right: 'Place right of', top: 'Place above', bottom: 'Place below' };
const boardDropLabels = { left: 'Full-height column on the left', right: 'Full-height column on the right', top: 'Full-width row at the top', bottom: 'Full-width row at the bottom', center: '' };

export function NewsWorkspace({ active }: { active: boolean }) {
  const saved = useTerminalStore(state => state.newsLayout);
  const save = useTerminalStore(state => state.setNewsLayout);
  const [draft, setDraft] = useState<NewsLayout | null>(null);
  const [destination, setDestination] = useState<Drop | null>(null);
  const [dragging, setDragging] = useState<NewsCardId | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scrollFrame = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const layout = draft ?? saved;
  const board = positionNewsTiles(layout, size.width, size.height);
  const editing = active && draft !== null;
  const contentRef = useCallback((node: HTMLDivElement | null) => { if (node) node.inert = editing; }, [editing]);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!active || !el) return;
    const measure = () => setSize(prev => prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active) { setDraft(null); setDestination(null); setDragging(null); }
    return () => { gesture.current = null; cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; };
  }, [active]);

  function targetAt(g: Gesture, clientX: number, clientY: number) {
    const r = surface.current?.getBoundingClientRect(), view = viewport.current?.getBoundingClientRect();
    if (!r || !view || !g.card || clientY < view.top || clientY > view.bottom) return null;
    const drop = newsDropTarget(g.board, g.card, clientX - r.left, clientY - r.top);
    if (drop && !g.board.stacked && (drop.edge === 'left' || drop.edge === 'right') &&
      minNewsWidth(dropNewsTile(g.layout.tree, g.card, drop)) > r.width) {
      return drop.target === 'board' ? null : { target: drop.target, edge: 'center' } as Drop;
    }
    return drop;
  }
  function showDestination(g: Gesture) {
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
  function begin(e: PointerEvent<HTMLElement>, card?: NewsCardId, resize?: Resize) {
    const r = surface.current?.getBoundingClientRect();
    if (!draft || !r || !e.isPrimary || e.button !== 0 || gesture.current) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { pointer: e.pointerId, card, resize, board, layout, x: e.clientX - r.left, y: e.clientY - r.top, moved: false };
  }
  function move(e: PointerEvent) {
    const g = gesture.current, r = surface.current?.getBoundingClientRect();
    if (!g || g.pointer !== e.pointerId || !r) return;
    const dx = e.clientX - r.left - g.x, dy = e.clientY - r.top - g.y;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    g.moved = true;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (g.resize) setDraft(resizeLayout(g.layout, g.board, g.resize, dx, dy, size.height));
    else if (g.card) {
      setDragging(g.card); showDestination(g);
      if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(scrollDuringDrag);
    }
  }
  function end(e?: PointerEvent, cancelled = false) {
    const g = gesture.current;
    if (!g || (e && g.pointer !== e.pointerId)) return;
    gesture.current = null;
    cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0;
    if (cancelled && g.resize) setDraft(g.layout);
    else if (e && g.moved && !cancelled) {
      if (g.card) {
        const d = targetAt(g, e.clientX, e.clientY);
        if (d) {
          setDraft({ ...g.layout, tree: dropNewsTile(g.layout.tree, g.card, d) });
          setAnnouncement(NEWS_CARD_NAMES[g.card] + ' moved.');
        }
      } else if (g.resize && surface.current) {
        const r = surface.current.getBoundingClientRect();
        setDraft(resizeLayout(g.layout, g.board, g.resize, e.clientX - r.left - g.x, e.clientY - r.top - g.y, size.height));
      }
    }
    setDragging(null); setDestination(null);
  }
  function keyControl(e: KeyboardEvent, tile?: Placement, resize?: Resize) {
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const step = e.shiftKey ? 60 : 16;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (resize) { setDraft(resizeLayout(layout, board, resize, dx, dy, size.height)); return; }
    if (!tile) return;
    const { left, top, width, height } = tile.rect;
    const options = board.tiles.filter(t => t.id !== tile.id).map(t => {
      const x = t.rect.left + t.rect.width / 2 - left - width / 2;
      const y = t.rect.top + t.rect.height / 2 - top - height / 2;
      return { id: t.id, forward: dx ? x * Math.sign(dx) : y * Math.sign(dy), across: Math.abs(dx ? y : x) };
    }).filter(t => t.forward > 1).sort((a, b) => a.across + a.forward - b.across - b.forward);
    const target = options[0]?.id;
    if (target) { setDraft({ ...layout, tree: dropNewsTile(layout.tree, tile.id, { target, edge: 'center' }) }); setAnnouncement('Swapped with ' + NEWS_CARD_NAMES[target]); }
  }

  const hint = destination && previewRect(destination, destination.target === 'board'
    ? { left: 0, top: 0, width: size.width, height: board.height }
    : board.tiles.find(t => t.id === destination.target)!.rect);

  return <div className={active ? 'flex h-full min-h-0 flex-col' : 'contents'} onKeyDown={e => {
    if (draft && e.key === 'Escape') { e.preventDefault(); if (gesture.current) end(undefined, true); else setDraft(null); }
  }}>
    {active && <WorkspaceHeader title="NEWS">
      {draft && <p id="news-edit-hint" className="min-w-0 flex-[1_1_18rem] text-[11px] text-terminal-muted">Drag onto a card to swap, or to an edge to place it there. Drag a corner or divider to resize.<span className="sr-only"> Use arrow keys on a move or resize control. Escape cancels.</span></p>}
      <div className="flex flex-wrap items-center gap-2">
        {draft ? <>
          <button type="button" className={action} onClick={() => setDraft(DEFAULT_NEWS_LAYOUT)}>Reset to default</button>
          <button type="button" className={action} onClick={() => setDraft(null)}>Cancel</button>
          <button type="button" className={action} onClick={() => { save(draft); setDraft(null); }}>Save layout</button>
        </> : <button type="button" className={'inline-flex items-center gap-1.5 ' + action} onClick={() => setDraft(saved)}><Settings2 size={13} />Edit layout</button>}
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </WorkspaceHeader>}
    <div key="workspace" ref={viewport} className={active ? 'm-2 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden sm:m-3' : 'contents'}>
      <div ref={surface} className={active ? 'relative w-full' : 'contents'} style={active ? { height: board.height } : undefined}
        onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)}>
        {NEWS_CARD_IDS.filter(id => active || id === 'player').map(id => {
          const tile = board.tiles.find(t => t.id === id)!;
          const { edges } = tile, title = NEWS_CARD_NAMES[id];
          const resize: Resize = board.stacked ? { stack: tile } : { x: edges.right ?? edges.left, y: edges.bottom ?? edges.top };
          const left = !edges.right && !!edges.left, top = !edges.bottom && !!edges.top;
          const diagonal = Boolean(resize.x && resize.y);
          const ResizeIcon = diagonal ? MoveDiagonal2 : resize.x ? MoveHorizontal : MoveVertical;
          const cursor = diagonal ? (left === top ? 'cursor-nwse-resize' : 'cursor-nesw-resize') : resize.x ? 'cursor-ew-resize' : 'cursor-ns-resize';
          return <section key={id} aria-label={title} className={active ? 'absolute min-w-0' : 'contents'} style={active ? tile.rect : undefined}>
            <div ref={contentRef} className={active ? 'h-full' : 'contents'}><NewsContent id={id} active={active} /></div>
            {active && draft && <>
              <button type="button" aria-label={'Move ' + title} aria-describedby="news-edit-hint"
                className={'news-move-handle ' + (dragging === id ? 'news-moving' : '')}
                onPointerDown={e => begin(e, id)} onKeyDown={e => keyControl(e, tile)}>
                <span><GripVertical size={17} />Move</span>
              </button>
              <button type="button" aria-label={'Resize ' + title} aria-describedby="news-edit-hint"
                className={'news-resize-corner ' + cursor}
                style={{ [left ? 'left' : 'right']: 3, [top ? 'top' : 'bottom']: 3 }}
                onPointerDown={e => begin(e, undefined, resize)} onKeyDown={e => keyControl(e, tile, resize)}>
                <ResizeIcon size={17} style={{ transform: diagonal && left !== top ? 'scaleX(-1)' : undefined }} />
              </button>
            </>}
          </section>;
        })}
        {active && sectionRules(board).map(rule => (
          <span key={rule.key} aria-hidden="true" className="news-section-rule pointer-events-none absolute" style={rule.rect} />
        ))}
        {active && draft && !board.stacked && board.dividers.map(d => {
          const handles = { [d.axis]: d };
          return <button key={d.path} type="button" aria-label={'Resize ' + (d.axis === 'x' ? 'columns' : 'rows') + ' between cards'}
            className={'news-divider ' + (d.axis === 'x' ? 'news-divider-x' : 'news-divider-y')} style={d.rect}
            onPointerDown={e => begin(e, undefined, handles)} onKeyDown={e => keyControl(e, undefined, handles)} />;
        })}
        {active && draft && !board.stacked && <button type="button" aria-label="Resize workspace bottom edge"
          className="news-divider news-divider-y bottom-0 left-1/4 h-2 w-1/2" onPointerDown={e => begin(e, undefined, { bottom: true })}
          onKeyDown={e => keyControl(e, undefined, { bottom: true })} />}
        {active && destination && hint && <div aria-hidden="true" className="news-drop-preview" style={hint}>
          <span>{destination.target === 'board' ? boardDropLabels[destination.edge] : dropLabels[destination.edge] + ' ' + NEWS_CARD_NAMES[destination.target]}</span>
        </div>}
      </div>
    </div>
  </div>;
}

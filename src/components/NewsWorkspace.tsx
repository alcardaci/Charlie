import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { DEFAULT_NEWS_LAYOUT, NEWS_CARD_NAMES, NEWS_SIZING, type NewsCardId, type NewsLayout } from '../utils/newsLayout';
import { CharlieLivePlayer } from './CharlieLivePlayer';
import { NewsPanel } from './NewsPanel';
import { PanelBoundary } from './PanelBoundary';
import { WorkspaceHeader } from './WorkspaceHeader';
import { TileLayoutActions, TileLayoutBoard, TileLayoutHint } from './TileLayoutBoard';

const EventCard = lazy(() => import('../panels/GeopoliticsPanel').then(m => ({ default: m.NewsEventCard })));
const RiskCard = lazy(() => import('../panels/GeopoliticsPanel').then(m => ({ default: m.NewsRiskCard })));
const NewsContent = memo(function NewsContent({ id, active }: { id: NewsCardId; active: boolean }) {
  if (id === 'player') return <CharlieLivePlayer embedded={active} />;
  return <PanelBoundary><Suspense fallback={<div className="shimmer h-full rounded" />}>
    {id === 'map' ? <EventCard /> : id === 'risk' ? <RiskCard /> : <NewsPanel embedded />}
  </Suspense></PanelBoundary>;
});

export function NewsWorkspace({ active }: { active: boolean }) {
  const saved = useTerminalStore(state => state.newsLayout);
  const save = useTerminalStore(state => state.setNewsLayout);
  const [draft, setDraft] = useState<NewsLayout | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!active) setDraft(null); }, [active]);

  return <div className={active ? 'flex h-full min-h-0 flex-col' : 'contents'} onKeyDown={e => {
    if (draft && e.key === 'Escape') { e.preventDefault(); setDraft(null); }
  }}>
    {active && <WorkspaceHeader title="NEWS">
      {draft && <TileLayoutHint id="news-edit-hint" />}
      <TileLayoutActions editing={!!draft} onEdit={() => setDraft(saved)} onReset={() => setDraft(DEFAULT_NEWS_LAYOUT)}
        onCancel={() => setDraft(null)} onSave={() => { if (draft) { save(draft); setDraft(null); } }} />
    </WorkspaceHeader>}
    <div key="workspace" ref={viewport} className={active ? 'm-2 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden sm:m-3' : 'contents'}>
      <TileLayoutBoard layout={draft ?? saved} names={NEWS_CARD_NAMES} sizing={NEWS_SIZING} viewport={viewport} active={active}
        editing={active && !!draft} onChange={setDraft} keepMounted="player" hintId="news-edit-hint"
        renderCard={id => <NewsContent id={id} active={active} />} />
    </div>
  </div>;
}

import { ChevronLeft, ChevronRight, ExternalLink, Minimize2, Play } from 'lucide-react';
import { useState } from 'react';

const LIVE_CHANNELS = [
  {
    id: 'al-jazeera',
    label: 'Al Jazeera',
    title: 'Al Jazeera',
    watchUrl: 'https://www.youtube.com/watch?v=gCNeDWCI0vo',
    videoId: 'gCNeDWCI0vo',
  },
  {
    id: 'bbc',
    label: 'BBC',
    title: 'BBC',
    watchUrl: 'https://www.youtube.com/watch?v=EcOPAnQb1w0',
    videoId: 'EcOPAnQb1w0',
  },
  {
    id: 'Bloomberg',
    label: 'Bloomberg',
    title: 'Bloomberg',
    watchUrl: 'https://www.youtube.com/watch?v=QB5BNdBFujE',
    videoId: 'QB5BNdBFujE',
  },
  {
    id: 'euronews',
    label: 'Euronews',
    title: 'Euronews',
    watchUrl: 'https://www.youtube.com/watch?v=pykpO5kQJ98',
    videoId: 'pykpO5kQJ98',
  },
  {
    id: 'euronews-it',
    label: 'Euronews IT',
    title: 'Euronews (Italian)',
    watchUrl: 'https://www.youtube.com/watch?v=pUcmpyynASM',
    videoId: 'pUcmpyynASM',
  },
  {
    id: 'france24',
    label: 'France 24',
    title: 'France 24',
    watchUrl: 'https://www.youtube.com/watch?v=HvZt-nh9sGg',
    videoId: 'HvZt-nh9sGg',
  },
  {
    id: 'nbc',
    label: 'NBC',
    title: 'NBC',
    watchUrl: 'https://www.youtube.com/watch?v=ilJYvFUtfn4',
    videoId: 'ilJYvFUtfn4',
  },
  {
    id: 'sky',
    label: 'Sky News',
    title: 'Sky News',
    watchUrl: 'https://www.youtube.com/watch?v=YDvsBbKfLPA',
    videoId: 'YDvsBbKfLPA',
  },
  {
    id: 'yahoo-finance',
    label: 'Yahoo Finance',
    title: 'Yahoo Finance',
    watchUrl: 'https://www.youtube.com/watch?v=KQp-e_XQnDE',
    videoId: 'KQp-e_XQnDE',
  },
] as const;

function embedUrlFor(videoId: string) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    rel: '0',
  });

  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    params.set('origin', window.location.origin);
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function CharlieLivePlayer({ embedded }: { embedded: boolean }) {
  const [isExpanded, setIsExpanded] = useState(
    () => (typeof window === 'undefined' ? true : window.innerWidth >= 768)
  );
  const [selectedChannelId, setSelectedChannelId] = useState<(typeof LIVE_CHANNELS)[number]['id']>('Bloomberg');
  const selectedChannel = LIVE_CHANNELS.find((channel) => channel.id === selectedChannelId) ?? LIVE_CHANNELS[0];
  const changeChannel = (direction: -1 | 1) => {
    const currentIndex = LIVE_CHANNELS.findIndex((channel) => channel.id === selectedChannelId);
    const nextIndex = (currentIndex + direction + LIVE_CHANNELS.length) % LIVE_CHANNELS.length;
    setSelectedChannelId(LIVE_CHANNELS[nextIndex].id);
  };

  return (
    <>
      {!embedded && !isExpanded && (
        <div className="fixed bottom-16 right-3 z-40 md:bottom-8 sm:right-4">
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-2 rounded-full border border-terminal-border bg-terminal-panel/95 px-3 py-2 text-xs text-terminal-text shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:border-terminal-accent/50 hover:bg-terminal-hover"
            title={`Open ${selectedChannel.title}`}
          >
            <span className="flex items-center gap-1 text-terminal-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-terminal-negative animate-pulse" />
              LIVE
            </span>
            <span>{selectedChannel.label}</span>
            <Play size={12} />
          </button>
        </div>
      )}

      <div
        aria-hidden={!embedded && !isExpanded}
        className={embedded ? 'h-full' : `fixed bottom-16 right-3 z-30 w-[min(92vw,360px)] md:bottom-8 sm:right-4 ${isExpanded ? '' : 'invisible pointer-events-none'}`}
      >
        <div className={`flex flex-col overflow-hidden rounded border border-terminal-border bg-terminal-panel ${embedded ? 'h-full' : 'shadow-2xl'}`}>
        <header className={embedded ? 'news-card-header' : 'flex items-center justify-between gap-2 border-b border-terminal-border px-3 py-2'}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-terminal-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-terminal-negative animate-pulse" />
              LIVE
            </div>
            <div className="truncate text-xs text-terminal-text">{selectedChannel.title}</div>
          </div>

          <div className="flex items-center gap-1">
            <a
              href={selectedChannel.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-terminal-border p-1.5 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover"
              title="Open on YouTube"
            >
              <ExternalLink size={12} />
            </a>
            {!embedded && <button
              onClick={() => setIsExpanded(false)}
              className="rounded border border-terminal-border p-1.5 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover"
              title="Minimize player"
            >
              <Minimize2 size={12} />
            </button>}
          </div>
        </header>

        <div className="flex items-center gap-2 border-b border-terminal-border px-3 py-2">
          <span className="text-[10px] tracking-[0.18em] text-terminal-faint">CHANNEL</span>
          <button
            onClick={() => changeChannel(-1)}
            className="rounded border border-terminal-border p-1 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover"
            title="Previous channel"
            aria-label="Previous channel"
          >
            <ChevronLeft size={14} />
          </button>
          <select
            value={selectedChannelId}
            onChange={(event) => setSelectedChannelId(event.target.value as (typeof LIVE_CHANNELS)[number]['id'])}
            className="min-w-0 flex-1 rounded border border-terminal-border bg-terminal-elevated px-2 py-1 text-xs text-terminal-text outline-none transition-colors hover:border-terminal-accent/40 focus:border-terminal-accent/50"
            aria-label="Select live news channel"
          >
            {LIVE_CHANNELS.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => changeChannel(1)}
            className="rounded border border-terminal-border p-1 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover"
            title="Next channel"
            aria-label="Next channel"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className={embedded ? "min-h-0 flex-1 bg-black" : "aspect-video bg-black"}>
          <iframe
            className="h-full w-full"
            src={embedUrlFor(selectedChannel.videoId)}
            title={`${selectedChannel.title} live stream`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
      </div>
    </>
  );
}

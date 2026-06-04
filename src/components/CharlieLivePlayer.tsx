import { ExternalLink, Minimize2, Play } from 'lucide-react';
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
    watchUrl: 'https://www.youtube.com/watch?v=iEpJwprxDdk',
    videoId: 'iEpJwprxDdk',
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
    watchUrl: 'https://www.youtube.com/watch?v=Ap-UM1O9RBU',
    videoId: 'Ap-UM1O9RBU',
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

export function CharlieLivePlayer() {
  const [isExpanded, setIsExpanded] = useState(
    () => (typeof window === 'undefined' ? true : window.innerWidth >= 768)
  );
  const [selectedChannelId, setSelectedChannelId] = useState<(typeof LIVE_CHANNELS)[number]['id']>('Bloomberg');
  const selectedChannel = LIVE_CHANNELS.find((channel) => channel.id === selectedChannelId) ?? LIVE_CHANNELS[0];

  return (
    <>
      {!isExpanded && (
        <div className="fixed bottom-8 right-3 z-40 sm:right-4">
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
        aria-hidden={!isExpanded}
        className={`fixed bottom-8 right-3 z-30 w-[min(92vw,360px)] sm:right-4 transition-all duration-200 ${
          isExpanded ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden rounded-lg border border-terminal-border bg-terminal-panel/95 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 border-b border-terminal-border px-3 py-2">
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
            <button
              onClick={() => setIsExpanded(false)}
              className="rounded border border-terminal-border p-1.5 text-terminal-faint transition-colors hover:border-terminal-accent/40 hover:text-terminal-accent hover:bg-terminal-hover"
              title="Minimize player"
            >
              <Minimize2 size={12} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-terminal-border px-3 py-2">
          <span className="text-[10px] tracking-[0.18em] text-terminal-faint">CHANNEL</span>
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
        </div>

        <div className="aspect-video bg-black">
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

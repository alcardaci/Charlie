import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { marketNewsQuery, NEWS_REFRESH_INTERVAL_MS } from '../api/marketNewsQuery';
import { advanceHeadlineTicker, headlineTickerStories, type TickerHeadline } from '../utils/liveNews';

const desktopMotion = '(min-width: 768px) and (prefers-reduced-motion: no-preference)';
const pixelsPerSecond = 34;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function canAnimateHeadlines() {
  return typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.animate === 'function' && window.matchMedia(desktopMotion).matches;
}

function Headline({ story, scrolling, first }: { story: TickerHeadline; scrolling: boolean; first: boolean }) {
  const { item, highlight } = story;
  const time = new Date(item.publishedAt);
  return (
    <li className={'shrink-0 border-r border-terminal-border ' + (scrolling ? '' : 'w-full snap-start md:w-max md:max-w-full')}>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={scrolling && !first ? -1 : undefined}
        className={'gap-x-3 px-3 py-1.5 text-terminal-text hover:bg-terminal-hover focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-terminal-accent '
          + (scrolling ? 'flex min-h-9 items-center whitespace-nowrap' : 'block break-words md:flex md:min-h-9 md:items-center')}
      >
        {highlight && <span className="mr-2 shrink-0 font-bold text-terminal-accent">{highlight}</span>}
        <span className="min-w-0 leading-snug">{item.title}</span>
        <span className={'shrink-0 text-[11px] text-terminal-muted ' + (scrolling ? '' : 'block')}>
          {item.publisher || new URL(item.link).hostname}
          {' · '}
          <time dateTime={time.toISOString()} title={time.toLocaleString()}>{timeFormat.format(time)}</time>
        </span>
      </a>
    </li>
  );
}

export function NewsTicker() {
  const queryClient = useQueryClient();
  const { data, dataUpdatedAt, errorUpdatedAt, isPending, isError } = useQuery({
    ...marketNewsQuery(queryClient),
    refetchInterval: NEWS_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const latest = useMemo(
    () => headlineTickerStories(data?.latest ?? [], Math.max(dataUpdatedAt, errorUpdatedAt)),
    [data, dataUpdatedAt, errorUpdatedAt],
  );
  const [queue, setQueue] = useState<{ visible: TickerHeadline[]; latest: TickerHeadline[] }>({ visible: [], latest: [] });
  const [motion, setMotion] = useState(canAnimateHeadlines);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => document.hidden);
  const bar = useRef<HTMLElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const animation = useRef<Animation | null>(null);
  const startWithPause = useRef(true);

  useEffect(() => {
    const media = window.matchMedia(desktopMotion);
    const syncMotion = () => setMotion(canAnimateHeadlines());
    const syncVisibility = () => setPageHidden(document.hidden);
    media.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    syncMotion();
    syncVisibility();
    return () => {
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useLayoutEffect(() => {
    setQueue(({ visible }) => {
      if (!motion || latest.length === 0 || visible.length === 0) return { visible: latest, latest };
      if (visible.length === 1) {
        return { visible: [visible[0], ...latest.filter(story => story.id !== visible[0].id)], latest };
      }
      return { visible, latest };
    });
  }, [latest, motion]);

  const advance = useCallback(() => setQueue(current => ({
    ...current,
    visible: advanceHeadlineTicker(current.visible, current.latest),
  })), []);
  const current = queue.visible[0];
  const scrolling = motion && queue.visible.length > 1;

  useLayoutEffect(() => {
    const row = track.current;
    if (!scrolling || !row?.firstElementChild) return;
    const distance = row.firstElementChild.getBoundingClientRect().width;
    const run = row.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-' + distance + 'px)' }],
      { duration: distance * 1000 / pixelsPerSecond, delay: startWithPause.current ? 900 : 0, fill: 'both' },
    );
    startWithPause.current = false;
    run.onfinish = advance;
    animation.current = run;
    return () => {
      run.onfinish = null;
      run.cancel();
      animation.current = null;
    };
  }, [scrolling, current?.id, advance]);

  useLayoutEffect(() => {
    const run = animation.current;
    const focusInside = focused && bar.current?.contains(document.activeElement);
    const held = hovered || focusInside || pageHidden;
    if (held) run?.pause();
    else if (run?.playState === 'paused') run.play();
  }, [hovered, focused, pageHidden, scrolling, current?.id]);

  return (
    <section
      ref={bar}
      aria-label="News headline ticker"
      className="flex min-h-9 shrink-0 items-stretch border-b border-terminal-border bg-terminal-elevated text-xs"
      onFocus={event => {
        const keyboardFocus = event.target.matches(':focus-visible');
        const headlineFocus = track.current?.contains(event.target) ?? false;
        setFocused(keyboardFocus || headlineFocus);
        if (keyboardFocus && headlineFocus && animation.current) {
          animation.current.currentTime = 0;
        }
      }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <div
        className={'min-w-0 flex-1 self-center ' + (scrolling ? 'overflow-clip' : 'snap-x snap-mandatory overflow-x-auto overscroll-x-contain')}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
      >
        {current ? (
          <ul ref={track} aria-live="off" className={scrolling ? 'flex w-max' : 'flex'}>
            {queue.visible.map((story, index) => (
              <Headline key={story.id} story={story} scrolling={scrolling} first={index === 0} />
            ))}
          </ul>
        ) : (
          <p role="status" className="px-3 py-1.5 text-xs text-terminal-muted">
            {isPending ? 'Loading headlines…' : isError ? 'Headlines unavailable' : 'No recent headlines'}
          </p>
        )}
      </div>
      {isError && current && (
        <span role="status" className="flex shrink-0 items-center border-l border-terminal-border px-2.5 text-[11px] text-terminal-muted">Delayed</span>
      )}
    </section>
  );
}

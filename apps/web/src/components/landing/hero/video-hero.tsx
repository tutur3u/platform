'use client';

import { Play } from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { HeroVignettesLeft, HeroVignettesRight } from './hero-vignettes';

const YOUTUBE_VIDEO_ID = 'JGWbvaAC24Q';

/** Browser chrome: traffic lights, an active tab, and the address pill. */
function FrameChrome({ tabLabel }: { tabLabel: string }) {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3 border-foreground/[0.06] border-b bg-foreground/[0.02] px-3 py-2"
    >
      <div className="flex shrink-0 gap-1.5 pl-1">
        <span className="h-2.5 w-2.5 rounded-full bg-dynamic-red/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-dynamic-yellow/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-dynamic-green/50" />
      </div>

      {/* Active tab */}
      <div className="hidden min-w-0 max-w-[13rem] flex-1 items-center gap-2 rounded-t-md border-foreground/[0.06] border-x border-t bg-background/70 px-2.5 py-1 sm:flex">
        <span className="h-2 w-2 shrink-0 rounded-[3px] bg-[linear-gradient(120deg,var(--purple),var(--blue))]" />
        <span className="truncate font-mono-ui text-[0.6rem] text-foreground/45">
          {tabLabel}
        </span>
      </div>

      {/* Address pill */}
      <div className="ml-auto hidden items-center gap-1.5 rounded-full border border-foreground/[0.07] bg-background/60 px-2.5 py-1 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-dynamic-green/70" />
        <span className="font-mono-ui text-[0.6rem] text-foreground/35 tracking-[0.1em]">
          tuturuuu.com
        </span>
      </div>

      {/* Compact fallback for narrow frames */}
      <span className="mx-auto font-mono-ui text-[0.62rem] text-foreground/35 tracking-[0.12em] sm:hidden">
        tuturuuu.com
      </span>
    </div>
  );
}

export function VideoHero() {
  const t = useTranslations('landing.hero.video');
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    // Centre the player after the swap so the video is not half off-screen.
    setTimeout(() => {
      containerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 100);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      {/* Vignettes sit outside the frame edges on large screens, which is why
          the hero reserves horizontal padding for them. */}
      {isPlaying ? null : (
        <>
          <HeroVignettesLeft />
          <HeroVignettesRight />
        </>
      )}

      {/* Player. The hero supplies the outer frame, so this only owns the
          browser chrome and the video surface. */}
      <div className="relative overflow-hidden rounded-xl bg-background">
        <FrameChrome tabLabel={t('tab')} />

        {isPlaying ? (
          <div className="aspect-video w-full">
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full"
              referrerPolicy="strict-origin-when-cross-origin"
              src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&showinfo=0`}
              title={t('title')}
            />
          </div>
        ) : (
          <button
            className="group relative block aspect-video w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={handlePlay}
            type="button"
          >
            {/* biome-ignore lint/performance/noImgElement: Keeps the landing dev compile graph off next/image. */}
            <img
              alt={t('thumbnail')}
              className="absolute inset-0 block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/maxresdefault.jpg`}
            />

            {/* Scrim keeps the control legible over any frame */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/10 to-transparent" />

            <div className="absolute inset-0 flex items-center justify-center">
              <span className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ring-pulse rounded-full bg-white/25"
                />
                <span className="relative flex h-full w-full items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md transition-all duration-500 group-hover:scale-110 group-hover:bg-white/20">
                  <Play className="h-6 w-6 translate-x-0.5 fill-white text-white sm:h-7 sm:w-7" />
                </span>
              </span>
            </div>

            <span className="absolute inset-x-0 bottom-4 flex justify-center">
              <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 font-mono-ui text-[0.6rem] text-white/80 uppercase tracking-[0.18em] backdrop-blur-md">
                {t('watchNow')}
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

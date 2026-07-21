'use client';

import {
  Calendar,
  CheckCircle2,
  MessageSquare,
  Play,
  Sparkles,
  TrendingUp,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

const YOUTUBE_VIDEO_ID = 'JGWbvaAC24Q';

/**
 * Floating notification card.
 *
 * Drifts on a long, offset cycle so the group never pulses in unison. Motion is
 * dropped entirely under `prefers-reduced-motion` via the global guard on
 * `.animate-float-y`.
 */
function FloatingCard({
  accent,
  children,
  className,
  delay,
}: {
  accent: string;
  children: React.ReactNode;
  className?: string;
  delay: string;
}) {
  return (
    <div
      className={cn(
        'animate-float-y rounded-xl border bg-background/80 p-3 shadow-foreground/5 shadow-lg backdrop-blur-md',
        accent,
        className
      )}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function CardLabel({
  icon: Icon,
  accent,
  children,
}: {
  icon: typeof Calendar;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className={cn('h-3.5 w-3.5', accent)} />
      <span className="font-mono-ui text-[0.58rem] uppercase tracking-[0.16em]">
        {children}
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
      {/* Floating cards — left. Positioned outside the frame on large screens,
          which is why the hero reserves horizontal padding for them. */}
      {isPlaying ? null : (
        <div className="pointer-events-none absolute top-6 left-0 z-20 hidden -translate-x-1/2 space-y-3 lg:block">
          <FloatingCard
            accent="border-dynamic-green/25"
            className="w-52"
            delay="0s"
          >
            <CardLabel accent="text-dynamic-green" icon={CheckCircle2}>
              {t('floatingCards.taskCard.title')}
            </CardLabel>
            <p className="text-foreground/60 text-xs leading-relaxed">
              {t('floatingCards.taskCard.description')}
            </p>
            <div className="mt-2 flex items-center gap-1.5 font-mono-ui text-[0.6rem] text-dynamic-green tabular-nums">
              <Sparkles className="h-3 w-3" />
              {t('floatingCards.taskCard.points')}
            </div>
          </FloatingCard>

          <FloatingCard
            accent="border-dynamic-blue/25"
            className="ml-10 w-44"
            delay="-2.5s"
          >
            <CardLabel accent="text-dynamic-blue" icon={Calendar}>
              {t('floatingCards.calendarCard.title')}
            </CardLabel>
            <p className="text-foreground/60 text-xs">
              {t('floatingCards.calendarCard.event')}
            </p>
            <p className="mt-0.5 font-mono-ui text-[0.6rem] text-dynamic-blue">
              {t('floatingCards.calendarCard.time')}
            </p>
          </FloatingCard>
        </div>
      )}

      {/* Floating cards — right */}
      {isPlaying ? null : (
        <div className="pointer-events-none absolute top-6 right-0 z-20 hidden translate-x-1/2 space-y-3 lg:block">
          <FloatingCard
            accent="border-dynamic-purple/25"
            className="w-52"
            delay="-1.2s"
          >
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-dynamic-purple" />
              <span className="font-mono-ui text-[0.58rem] uppercase tracking-[0.16em]">
                {t('floatingCards.aiCard.title')}
              </span>
              <span className="relative ml-auto flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dynamic-green opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-dynamic-green" />
              </span>
            </div>
            <p className="text-foreground/60 text-xs leading-relaxed">
              {t('floatingCards.aiCard.message')}
            </p>
          </FloatingCard>

          <FloatingCard
            accent="border-dynamic-cyan/25"
            className="mr-10 w-40"
            delay="-3.8s"
          >
            <CardLabel accent="text-dynamic-cyan" icon={TrendingUp}>
              {t('floatingCards.productivityCard.title')}
            </CardLabel>
            <div className="font-display font-semibold text-2xl text-dynamic-cyan tabular-nums tracking-[-0.03em]">
              {t('floatingCards.productivityCard.stat')}
            </div>
            <p className="mt-0.5 font-mono-ui text-[0.58rem] text-foreground/45">
              {t('floatingCards.productivityCard.change')}
            </p>
          </FloatingCard>
        </div>
      )}

      {/* Player. The hero supplies the outer frame, so this only owns the
          browser chrome and the video surface. */}
      <div className="relative overflow-hidden rounded-xl bg-background">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-foreground/[0.06] border-b bg-foreground/[0.02] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-dynamic-red/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-dynamic-yellow/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-dynamic-green/50" />
          </div>
          <div className="mx-auto flex-1 text-center">
            <span className="font-mono-ui text-[0.62rem] text-foreground/35 tracking-[0.12em]">
              tuturuuu.com
            </span>
          </div>
        </div>

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
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />

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

'use client';

import { Play } from '@tuturuuu/icons/lucide';
import { useCallback, useRef, useState } from 'react';
const YOUTUBE_VIDEO_ID = 'JGWbvaAC24Q';

export function VideoPlayer({
  title,
  playLabel,
  watchNow,
}: {
  title: string;
  playLabel: string;
  watchNow: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    // Centre the player after the swap so the video is not half off-screen.
    setTimeout(() => {
      containerRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'center',
      });
    }, 100);
  }, []);

  return (
    <div className="absolute inset-0" ref={containerRef}>
      {isPlaying ? (
        <div className="h-full w-full bg-black">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
            referrerPolicy="strict-origin-when-cross-origin"
            src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&showinfo=0`}
            title={title}
          />
        </div>
      ) : (
        <button
          aria-label={playLabel}
          className="group relative block h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={handlePlay}
          type="button"
        >
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
              {watchNow}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

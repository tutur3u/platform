'use client';

import { Check, Loader2, Trash2, Youtube } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com']);

function getYoutubeVideoId(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const videoId = parsed.pathname.split('/').filter(Boolean)[0];
    return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  }

  if (!YOUTUBE_HOSTS.has(host) || parsed.pathname !== '/watch') return null;

  const videoId = parsed.searchParams.get('v');
  return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function LessonSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-5 md:px-8">
      <div className="h-10 w-48 animate-pulse border-2 border-border bg-card shadow-[2px_2px_0_var(--border)]" />
      <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
        <div className="h-8 w-3/4 animate-pulse bg-muted" />
        <div className="h-4 w-1/2 animate-pulse bg-muted" />
        <div className="mt-6 h-64 animate-pulse bg-muted/60" />
      </div>
    </div>
  );
}

export function YoutubeRow({
  url,
  onRemove,
}: {
  url: string;
  onRemove: () => void;
}) {
  const videoId = getYoutubeVideoId(url);

  return (
    <div className="group/yt flex items-center gap-2 border-2 border-border bg-card px-3 py-2 shadow-[2px_2px_0_var(--border)]">
      <Youtube className="h-4 w-4 shrink-0 text-dynamic-red" />
      {videoId ? (
        <a
          className="min-w-0 flex-1 truncate text-sm hover:underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {url}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
          {url}
        </span>
      )}
      <button
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/yt:opacity-100"
        onClick={onRemove}
        type="button"
        aria-label="Remove YouTube link"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SaveStatus({ isSaving }: { isSaving: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs transition-opacity',
        isSaving ? 'text-muted-foreground' : 'text-dynamic-green'
      )}
    >
      {isSaving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check className="h-3 w-3" />
          Saved
        </>
      )}
    </span>
  );
}

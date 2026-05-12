import { Youtube } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

export function extractYoutubeId(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1) || undefined;
    }
    const hostname = parsed.hostname;
    const isYoutube =
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com';
    const isYoutubeNoCookie =
      hostname === 'youtube-nocookie.com' ||
      hostname === 'www.youtube-nocookie.com';

    if (isYoutube || isYoutubeNoCookie) {
      const v = parsed.searchParams.get('v');
      if (v) return v;
      const pathMatch = parsed.pathname.match(/\/(embed|v|shorts)\/([^/?]+)/);
      if (pathMatch?.[2]) return pathMatch[2];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isSafeYoutubeId(videoId: string) {
  return /^[A-Za-z0-9_-]{6,32}$/u.test(videoId);
}

function isSafeFallbackHref(href: string) {
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function YoutubeCard({ url }: { url: string }) {
  const t = useTranslations();
  const videoId = extractYoutubeId(url);
  const fallbackHref = isSafeFallbackHref(url) ? url : '#';

  if (!videoId || !isSafeYoutubeId(videoId)) {
    return (
      <a
        className="flex items-center gap-2 border-2 border-border bg-muted/40 px-4 py-3 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5"
        href={fallbackHref}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Youtube className="h-4 w-4 shrink-0 text-dynamic-red" />
        <span className="truncate">{url}</span>
      </a>
    );
  }

  return (
    <div className="overflow-hidden border-2 border-border shadow-[3px_3px_0_var(--border)]">
      <div className="relative aspect-video">
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          referrerPolicy="strict-origin-when-cross-origin"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
            videoId
          )}`}
          title={t('courses.youtubeVideo')}
        />
      </div>
    </div>
  );
}

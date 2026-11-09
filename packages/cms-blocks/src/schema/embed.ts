/** Providers an Embed block may load. Anything else is rejected at save and render time. */
export const CMS_EMBED_PROVIDERS = ['youtube', 'vimeo', 'google-maps'] as const;
export type CmsEmbedProvider = (typeof CMS_EMBED_PROVIDERS)[number];

export interface CmsEmbedSource {
  provider: CmsEmbedProvider;
  /** Canonical, privacy-preferring iframe `src` derived from the editor's URL. */
  src: string;
}

/** C0/C1 control characters, DEL and spaces; browsers strip some of these before parsing a URL. */
function hasControlOrSpace(value: string) {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

function youtubeId(url: URL): string | undefined {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1);
  if (!YOUTUBE_HOSTS.has(url.hostname)) return undefined;
  if (url.pathname === '/watch') return url.searchParams.get('v') ?? undefined;
  const match = /^\/(?:embed|shorts|live)\/([^/]+)$/.exec(url.pathname);
  return match?.[1];
}

function vimeoId(url: URL): string | undefined {
  if (url.hostname === 'vimeo.com' || url.hostname === 'www.vimeo.com') {
    return /^\/(\d+)$/.exec(url.pathname)?.[1];
  }
  if (url.hostname === 'player.vimeo.com') {
    return /^\/video\/(\d+)$/.exec(url.pathname)?.[1];
  }
  return undefined;
}

/**
 * Resolves an editor-entered URL to an allowlisted iframe source, or `null`.
 * Only `https:` URLs without credentials or control characters are accepted,
 * so `javascript:`, `data:` and other schemes never reach an iframe.
 */
export function resolveCmsEmbed(input: string): CmsEmbedSource | null {
  if (input.length > 2048 || hasControlOrSpace(input)) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return null;
  }

  const youtube = youtubeId(url);
  if (youtube !== undefined) {
    return YOUTUBE_ID.test(youtube)
      ? {
          provider: 'youtube',
          src: `https://www.youtube-nocookie.com/embed/${youtube}`,
        }
      : null;
  }
  const vimeo = vimeoId(url);
  if (vimeo !== undefined) {
    return VIMEO_ID.test(vimeo)
      ? { provider: 'vimeo', src: `https://player.vimeo.com/video/${vimeo}` }
      : null;
  }
  if (
    url.hostname === 'www.google.com' &&
    url.pathname === '/maps/embed' &&
    url.searchParams.has('pb')
  ) {
    return {
      provider: 'google-maps',
      src: `https://www.google.com/maps/embed?pb=${encodeURIComponent(url.searchParams.get('pb') ?? '')}`,
    };
  }
  return null;
}

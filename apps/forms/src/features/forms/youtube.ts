const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

function parseTimeToken(token: string | null) {
  if (!token) {
    return 0;
  }

  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(token.trim());
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseYouTubeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const host = parsed.hostname.toLowerCase();
  let videoId = '';

  if (host.includes('youtu.be')) {
    videoId = segments[0] ?? '';
  } else if (segments[0] === 'watch') {
    videoId = parsed.searchParams.get('v') ?? '';
  } else if (segments[0] === 'embed' || segments[0] === 'shorts') {
    videoId = segments[1] ?? '';
  } else if (segments[0] === 'live') {
    videoId = segments[1] ?? '';
  } else {
    videoId = parsed.searchParams.get('v') ?? '';
  }

  videoId = videoId.trim();
  if (!/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
    return null;
  }

  const startSeconds = Math.max(
    0,
    parseTimeToken(
      parsed.searchParams.get('t') ?? parsed.searchParams.get('start')
    )
  );

  return {
    videoId,
    startSeconds,
    embedUrl: `https://www.youtube.com/embed/${videoId}${startSeconds > 0 ? `?start=${startSeconds}` : ''}`,
  };
}

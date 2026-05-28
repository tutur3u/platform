export function getYouTubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./u, '').toLowerCase();
    let videoId: string | null = null;

    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com'
    ) {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else if (
        url.pathname.startsWith('/shorts/') ||
        url.pathname.startsWith('/embed/')
      ) {
        videoId = url.pathname.split('/').filter(Boolean)[1] ?? null;
      }
    }

    if (!videoId || !/^[\w-]{6,32}$/u.test(videoId)) return null;

    const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
    const start = parseYouTubeStartSeconds(url.searchParams.get('t'));
    if (start) embed.searchParams.set('start', String(start));
    return embed.toString();
  } catch {
    return null;
  }
}

function parseYouTubeStartSeconds(value: string | null) {
  if (!value) return 0;

  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) return Math.max(0, numeric);

  const match = value.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/iu);
  if (!match) return 0;

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  const seconds = Number.parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

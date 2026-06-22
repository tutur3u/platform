export function extractYoutubeId(url: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(url);
    const youtubeHosts = ['www.youtube.com', 'youtube.com', 'youtu.be'];

    if (!youtubeHosts.includes(parsedUrl.host)) {
      return undefined;
    }

    const videoId = parsedUrl.searchParams.get('v');
    if (videoId) {
      return videoId;
    }

    const possibleId = parsedUrl.pathname.split('/').at(-1);
    return possibleId?.length === 11 ? possibleId : undefined;
  } catch {
    return undefined;
  }
}

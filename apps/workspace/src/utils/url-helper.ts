export const isValidURL = (url: string): boolean => {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);

    // Check if the protocol has valid protocols
    const validProtocols = [
      'http:',
      'https:',
      'ftp:',
      'mailto:',
      'tel:',
      'file:',
    ];

    return validProtocols.includes(parsedUrl.protocol);
  } catch {
    return false;
  }
};

export const extractYoutubeId = (url: string): string | undefined => {
  if (!url) return undefined;

  try {
    const parsedUrl = new URL(url);
    const youtubeHosts = ['www.youtube.com', 'youtube.com', 'youtu.be'];

    if (youtubeHosts.includes(parsedUrl.host)) {
      const searchParams = new URLSearchParams(parsedUrl.search);
      const videoId = searchParams.get('v');

      if (videoId) {
        return videoId;
      }

      const pathSegments = parsedUrl.pathname.split('/');
      if (pathSegments.length > 1) {
        const possibleId = pathSegments[pathSegments.length - 1];
        if (possibleId?.length === 11) {
          return possibleId;
        }
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
};

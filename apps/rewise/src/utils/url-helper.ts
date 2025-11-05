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
  } catch (_e) {
    return false;
  }
};

export function getSessionMetadata(request: Pick<Request, 'headers'>) {
  const userAgent = request.headers.get('user-agent') ?? '';
  const referrer = request.headers.get('referer');
  let referrerDomain: string | null = null;
  if (referrer) {
    try {
      referrerDomain = new URL(referrer).hostname;
    } catch {
      referrerDomain = null;
    }
  }
  const browser = userAgent.includes('Chrome')
    ? 'Chrome'
    : userAgent.includes('Safari')
      ? 'Safari'
      : userAgent.includes('Firefox')
        ? 'Firefox'
        : 'Other';
  const os = userAgent.includes('Mac')
    ? 'macOS'
    : userAgent.includes('Windows')
      ? 'Windows'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('iPhone') || userAgent.includes('iPad')
          ? 'iOS'
          : 'Other';
  const deviceType = /Mobi|Android|iPhone|iPad/i.test(userAgent)
    ? 'mobile'
    : 'desktop';

  return {
    referrerDomain,
    browser,
    os,
    deviceType,
    country: request.headers.get('x-vercel-ip-country'),
    city: request.headers.get('x-vercel-ip-city'),
  };
}

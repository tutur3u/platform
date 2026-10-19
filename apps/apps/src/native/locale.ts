import { resolveTuturuuuSharedCookieDomain } from '@tuturuuu/utils/shared-cookie';
export type Locale = 'en' | 'vi';
export function requestLocale(request: Request): Locale {
  const saved = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('NEXT_LOCALE='))
    ?.slice(12);
  if (saved === 'en' || saved === 'vi') return saved;
  const languages = (request.headers.get('accept-language') ?? '')
    .split(',')
    .map((item, index) => {
      const [tag = '', ...parameters] = item.trim().split(';');
      const quality = parameters.find((part) => part.trim().startsWith('q='));
      return {
        tag: tag.toLowerCase().split('-')[0],
        quality: quality ? Number(quality.trim().slice(2)) : 1,
        index,
      };
    })
    .filter(
      (item) =>
        Number.isFinite(item.quality) && item.quality > 0 && item.quality <= 1
    )
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return languages.find((item) => item.tag === 'en' || item.tag === 'vi')
    ?.tag === 'vi'
    ? 'vi'
    : 'en';
}
export function localeCookie(request: Request, locale: Locale) {
  const sharedDomain = resolveTuturuuuSharedCookieDomain(request);
  return `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${sharedDomain ? `; Domain=${sharedDomain.cookieDomain}` : ''}${sharedDomain?.secure || new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function canonicalLocaleRedirect(request: Request) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const locale = segments[0];
  if (locale !== 'en' && locale !== 'vi') return null;
  url.pathname = `/${segments.slice(1).join('/')}`;
  return new Response(null, {
    status: 307,
    headers: {
      Location: url.toString(),
      'Set-Cookie': localeCookie(request, locale),
      'Cache-Control': 'private, no-store',
    },
  });
}

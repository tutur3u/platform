import { match } from '@formatjs/intl-localematcher';
import { LOCALE_COOKIE_NAME } from '@tuturuuu/satellite/constants';
import Negotiator from 'negotiator';
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { defaultLocale, type Locale, supportedLocales } from '../i18n/routing';

function supported(value: string | undefined): Locale | undefined {
  return value === 'en' || value === 'vi' ? value : undefined;
}

export function resolveCalendarLocale(
  request: Pick<Request, 'url' | 'headers'>
): Locale {
  const path = supported(new URL(request.url).pathname.split('/')[1]);
  if (path) return path;
  const cookie = supported(
    new RequestCookies(request.headers).get(LOCALE_COOKIE_NAME)?.value
  );
  if (cookie) return cookie;
  const languages = new Negotiator({
    headers: {
      'accept-language':
        request.headers.get('accept-language') ?? 'en-US,en;q=0.5',
    },
  }).languages();
  return (
    supported(match(languages, supportedLocales, defaultLocale)) ??
    defaultLocale
  );
}

import { match } from '@formatjs/intl-localematcher';
import { LOCALE_COOKIE_NAME } from '@tuturuuu/satellite/constants';
import Negotiator from 'negotiator';
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { defaultLocale, type Locale, supportedLocales } from '../i18n/routing';
import { calendarBase } from './calendar-mount';

function supported(value: string | undefined): Locale | undefined {
  return value === 'en' || value === 'vi' ? value : undefined;
}

export function resolveCalendarLocale(
  request: Pick<Request, 'url' | 'headers'>
): Locale {
  const url = new URL(request.url);
  const pathname = calendarBase(url)?.strip(url.pathname) ?? url.pathname;
  const path = supported(pathname.split('/')[1]);
  if (path) return path;
  const cookie = supported(
    new RequestCookies(request.headers).get(LOCALE_COOKIE_NAME)?.value
  );
  if (cookie) return cookie;
  return preferredCalendarLocale(request.headers.get('accept-language'));
}

export function preferredCalendarLocale(acceptLanguage: string | null): Locale {
  const languages = new Negotiator({
    headers: {
      'accept-language': acceptLanguage ?? 'en-US,en;q=0.5',
    },
  })
    .languages()
    .flatMap((language) => {
      if (language === '*') return [];
      try {
        return Intl.getCanonicalLocales(language);
      } catch (error) {
        if (error instanceof RangeError) return [];
        throw error;
      }
    });
  return (
    supported(match(languages, supportedLocales, defaultLocale)) ??
    defaultLocale
  );
}

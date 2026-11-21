import {
  getTuturuuuBrowserCookieDeleteOptions,
  getTuturuuuBrowserSharedCookieOptions,
} from '@tuturuuu/utils/shared-cookie';
import { deleteCookie, setCookie } from 'cookies-next';

export const DEFAULT_LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;

export function persistLocalePreference(
  locale: string,
  cookieName = DEFAULT_LOCALE_COOKIE_NAME
) {
  setCookie(
    cookieName,
    locale,
    getTuturuuuBrowserSharedCookieOptions(LOCALE_COOKIE_OPTIONS)
  );
}

export function clearLocalePreference(cookieName = DEFAULT_LOCALE_COOKIE_NAME) {
  for (const options of getTuturuuuBrowserCookieDeleteOptions(
    LOCALE_COOKIE_OPTIONS
  )) {
    deleteCookie(cookieName, options);
  }
}

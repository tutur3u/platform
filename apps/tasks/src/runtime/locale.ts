import { LOCALE_COOKIE_NAME } from '@tuturuuu/satellite/constants';
import { bridgeRequest } from '@tuturuuu/start-bridge/request-context';
import {
  preferredRequestLocale,
  resolveRequestLocale,
} from '../lib/request-locale';

/**
 * Locale for an app-relative router path: its `en`/`vi` prefix, then the
 * locale cookie, then the browser languages (the proxy's precedence).
 */
export function resolvePathLocale(path: string) {
  const { headers } = bridgeRequest().request;
  const cookie = headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === LOCALE_COOKIE_NAME)?.[1];
  return resolveRequestLocale({
    pathname: new URL(path, 'http://app.invalid').pathname,
    cookie,
    fallback: () => preferredRequestLocale(headers.get('accept-language')),
  });
}

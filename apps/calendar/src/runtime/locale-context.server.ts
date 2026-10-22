import '@tanstack/react-start/server-only';
import { calendarRequest } from './request-context';
import { resolveCalendarLocale } from './request-locale';

export function loadLocaleContext(path: string) {
  const request = calendarRequest().request;
  const url = new URL(path, request.url);
  if (url.origin !== new URL(request.url).origin)
    throw new Error('Invalid Calendar locale origin');
  return resolveCalendarLocale(new Request(url, { headers: request.headers }));
}

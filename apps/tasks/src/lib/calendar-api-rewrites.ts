import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

/**
 * The `/api/*` paths the Tasks app's Next `beforeFiles` rewrites forward to the
 * Calendar app: the Calendar app owns them, not central Web and not Tasks.
 * The native Worker's forwarding catch-all matches the same sources, so both
 * runtimes route Calendar-owned requests to one owner.
 */
export const CALENDAR_API_REWRITE_SOURCES = [
  '/api/v1/calendar/:path*',
  '/api/v1/mira/calendar/:path*',
  '/api/:wsId/calendar/:path*',
  '/api/v1/users/calendar-settings',
  '/api/v1/workspaces/:wsId/calendar/:path*',
  '/api/v1/workspaces/:wsId/calendar-hours/:path*',
  '/api/v1/workspaces/:wsId/calendar-settings',
  '/api/v1/workspaces/:wsId/calendars/:path*',
] as const;

export function createCalendarApiRewrites(origin: string) {
  const base = origin.replace(/\/+$/, '');
  return CALENDAR_API_REWRITE_SOURCES.flatMap((source) =>
    source.endsWith('/:path*')
      ? [source.replace(/\/:path\*$/u, ''), source]
      : [source]
  ).map((source) => ({ source, destination: `${base}${source}` }));
}

/**
 * Whether a `/api/*` request (segments after `/api/`) is Calendar-owned, per
 * {@link CALENDAR_API_REWRITE_SOURCES}: `:param` matches one segment and the
 * trailing `:path*` matches zero or more. Sources without `:path*` match
 * exactly, so e.g. `/api/v1/users/calendar-settings` owns only itself.
 */
export function isCalendarOwnedApiPath(path: readonly string[]): boolean {
  return CALENDAR_API_REWRITE_SOURCES.some((source) => {
    const segments = source.split('/').filter(Boolean);
    if (segments[0] === 'api') segments.shift();
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      if (segment.endsWith('*')) return index <= path.length;
      const actual = path[index];
      if (actual === undefined) return false;
      if (!segment.startsWith(':') && actual !== segment) return false;
    }
    return path.length === segments.length;
  });
}

/** The Calendar app origin for Calendar-owned API forwarding. */
export function resolveCalendarAppUrl() {
  return resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [
      process.env.CALENDAR_APP_URL,
      process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://calendar.tuturuuu.com'
        : getLocalInternalAppUrl('calendar', 'http://localhost:7806'),
  });
}

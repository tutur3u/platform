export function createCalendarApiRewrites(origin: string) {
  const base = origin.replace(/\/+$/, '');
  return [
    '/api/v1/calendar/:path*',
    '/api/v1/mira/calendar/:path*',
    '/api/:wsId/calendar/:path*',
    '/api/v1/users/calendar-settings',
    '/api/v1/workspaces/:wsId/calendar/:path*',
    '/api/v1/workspaces/:wsId/calendar-hours/:path*',
    '/api/v1/workspaces/:wsId/calendar-settings',
    '/api/v1/workspaces/:wsId/calendars/:path*',
  ]
    .flatMap((source) =>
      source.endsWith('/:path*')
        ? [source.replace(/\/:path\*$/u, ''), source]
        : [source]
    )
    .map((source) => ({ source, destination: `${base}${source}` }));
}

export const GATEWAY_PREFIX = '/api/v1/mobile-calendar';

export function calendarGatewayRoute(pathname: string) {
  if (!pathname.startsWith(`${GATEWAY_PREFIX}/`)) return null;
  const path = pathname.slice(GATEWAY_PREFIX.length);
  const methods = allowedMethods(path);
  return methods.length > 0 ? { path, methods } : null;
}

// Only the native Calendar repository's JSON APIs are forwarded. OAuth
// callbacks, media, AI endpoints, cron routes and arbitrary URLs are excluded.
function allowedMethods(path: string): string[] {
  const id = '[a-zA-Z0-9_-]+';
  if (
    new RegExp(
      `^/api/v1/workspaces/${id}/calendar/(?:colors|default-source)$`
    ).test(path)
  ) {
    return ['GET'];
  }
  if (
    path === '/api/v1/users/calendar-settings' ||
    new RegExp(`^/api/v1/workspaces/${id}/calendar-settings$`).test(path)
  ) {
    return ['GET', 'PATCH'];
  }
  if (new RegExp(`^/api/v1/workspaces/${id}/calendar/events$`).test(path)) {
    return ['GET', 'POST'];
  }
  if (
    new RegExp(`^/api/v1/workspaces/${id}/calendar/events/${id}$`).test(path)
  ) {
    return ['GET', 'PUT', 'DELETE'];
  }
  if (
    new RegExp(
      `^/api/v1/workspaces/${id}/calendar/events/${id}/response$`
    ).test(path)
  ) {
    return ['POST'];
  }
  if (path === '/api/v1/calendar/auth/accounts') return ['GET', 'DELETE'];
  if (path === '/api/v1/calendar/connections') return ['GET', 'PATCH'];
  if (
    path === '/api/v1/calendar/auth' ||
    path === '/api/v1/calendar/auth/microsoft'
  )
    return ['GET'];
  return [];
}

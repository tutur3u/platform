export function forwardCalendarAcmeChallenge(request: Request) {
  const url = new URL(request.url);
  if (
    url.hostname === 'calendar.tuturuuu.com' &&
    !url.port &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    url.pathname.startsWith('/.well-known/acme-challenge/')
  ) {
    return fetch(request, { redirect: 'manual' });
  }
  return undefined;
}

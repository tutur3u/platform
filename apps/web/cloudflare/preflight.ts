/**
 * Answers every OPTIONS request inside the Worker (staging-web-publisher V5b).
 *
 * The Access app passes OPTIONS through to the origin so CORS preflights work,
 * including while the serving off-switch (S1) blocks everything else. The
 * issuer therefore never forwards OPTIONS to Next, reads no body, touches no
 * session and makes no subrequest; a preflight is answered here or nowhere.
 */
const stagingOrigin =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.staging\.tutur3u\.com$/u;
const requestedHeaders = /^[A-Za-z0-9-]+(?:\s*,\s*[A-Za-z0-9-]+)*$/u;

export function answerPreflight(request: Request) {
  const headers = new Headers({
    'cache-control': 'no-store',
    vary: 'Origin, Access-Control-Request-Headers',
  });
  const origin = request.headers.get('origin') ?? '';
  // Exact single-label staging origins only, matching the shared cookie zone.
  if (stagingOrigin.test(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set(
      'access-control-allow-methods',
      'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    const asked = request.headers.get('access-control-request-headers') ?? '';
    if (asked.length <= 1024 && requestedHeaders.test(asked))
      headers.set('access-control-allow-headers', asked);
    headers.set('access-control-max-age', '600');
  }
  void request.body?.cancel();
  return new Response(null, { status: 204, headers });
}

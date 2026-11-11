/** Match the blocked Next catch-all without exposing issuer metadata. */
export function isBlockedWellKnownRequest(request: Request) {
  return (
    ['GET', 'HEAD'].includes(request.method) &&
    /^\/\.well-known\/.+/u.test(new URL(request.url).pathname)
  );
}

export function blockedWellKnownResponse() {
  return new Response(null, {
    status: 404,
    headers: { 'cache-control': 'public, max-age=300, must-revalidate' },
  });
}

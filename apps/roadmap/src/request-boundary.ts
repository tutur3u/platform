export function roadmapBoundary(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname === '/roadmap') {
    return new Response(null, {
      status: 308,
      headers: { Location: `/roadmap/${url.search}` },
    });
  }
  if (/[%\\]/.test(url.pathname)) {
    return new Response('Bad Request', { status: 400 });
  }
  if (!url.pathname.startsWith('/roadmap/')) {
    return new Response('Not Found', { status: 404 });
  }
  return undefined;
}

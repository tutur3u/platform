/**
 * Request header carrying a `proxy.ts` rewrite target to the native page
 * loader. The start bridge renders the browser-visible URL, so the proxy
 * sets this alongside each page rewrite; the Worker drops any client-sent
 * copy before the proxy runs. Next ignores it.
 */
export const PAGE_REWRITE_HEADER = 'x-tuturuuu-page-rewrite';

export function withoutPageRewrite(request: Request) {
  if (!request.headers.has(PAGE_REWRITE_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(PAGE_REWRITE_HEADER);
  return new Request(request, { headers });
}

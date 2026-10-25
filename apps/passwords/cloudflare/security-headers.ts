const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Permissions-Policy': 'clipboard-write=(self), clipboard-read=(self)',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, nosnippet',
} as const;

/** Every non-asset response, including secret reveals, is uncacheable and unframeable. */
export function withSecurityHeaders(response: Response) {
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers))
    result.headers.set(name, value);
  return result;
}

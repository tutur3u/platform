import type { NextRequest } from 'next/server';
import { matchRoute, type RouteParams } from './route-match';

type Handler = (
  request: NextRequest,
  params: RouteParams
) => Response | Promise<Response>;
export interface MailEndpoint {
  pattern: string;
  methods: Partial<Record<string, Handler>>;
}

export async function dispatchEndpoint(
  request: NextRequest,
  endpoints: MailEndpoint[]
): Promise<Response | null> {
  const ordered = endpoints.toSorted(
    (a, b) =>
      (a.pattern.match(/\[/gu)?.length ?? 0) -
      (b.pattern.match(/\[/gu)?.length ?? 0)
  );
  for (const endpoint of ordered) {
    let params: RouteParams | null;
    try {
      params = matchRoute(endpoint.pattern, request.nextUrl.pathname);
    } catch (error) {
      if (error instanceof URIError)
        return new Response('Bad Request', { status: 400 });
      throw error;
    }
    if (!params) continue;
    const allowed = [...Object.keys(endpoint.methods)];
    if (endpoint.methods.GET && !endpoint.methods.HEAD) allowed.push('HEAD');
    if (!endpoint.methods.OPTIONS) allowed.push('OPTIONS');
    if (request.method === 'OPTIONS' && !endpoint.methods.OPTIONS)
      return new Response(null, {
        status: 204,
        headers: { Allow: allowed.join(', ') },
      });
    const method =
      request.method === 'HEAD' && !endpoint.methods.HEAD
        ? 'GET'
        : request.method;
    const handler = endpoint.methods[method];
    if (!handler)
      return new Response(null, {
        status: 405,
        headers: { Allow: allowed.join(', ') },
      });
    const response = await handler(request, params);
    if (request.method === 'HEAD')
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    return response;
  }
  return null;
}

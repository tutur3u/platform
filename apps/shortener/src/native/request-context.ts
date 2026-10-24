import { AsyncLocalStorage } from 'node:async_hooks';
import {
  RequestCookies,
  ResponseCookies,
} from 'next/dist/compiled/@edge-runtime/cookies';
import type { ShortLinkPage } from '../link/resolve';

interface RequestContext {
  request: Request;
  page: ShortLinkPage | null;
  responseHeaders: Headers;
  cookieStore: RequestCookies;
}
const storage = new AsyncLocalStorage<RequestContext>();

/** Carries the Worker-resolved page model into Start SSR for one request. */
export function withRequestContext<T>(request: Request, work: () => T) {
  return storage.run(
    {
      request,
      page: null,
      responseHeaders: new Headers(),
      cookieStore: new RequestCookies(new Headers(request.headers)),
    },
    work
  );
}
export function requestContext() {
  const context = storage.getStore();
  if (!context) throw new Error('Shortener request context unavailable');
  return context;
}
export function setContextPage(page: ShortLinkPage | null) {
  requestContext().page = page;
}
export function contextPage(): ShortLinkPage | null {
  return storage.getStore()?.page ?? null;
}
// `next/headers` port for shared server modules reached by the API guard.
export async function headers() {
  return new Headers(requestContext().request.headers);
}
export async function cookies() {
  const context = requestContext();
  const incoming = context.cookieStore;
  const outgoing = new ResponseCookies(context.responseHeaders);
  return {
    get: incoming.get.bind(incoming),
    getAll: incoming.getAll.bind(incoming),
    has: incoming.has.bind(incoming),
    set(...args: Parameters<ResponseCookies['set']>) {
      outgoing.set(...args);
      for (const cookie of outgoing.getAll())
        incoming.set(cookie.name, cookie.value);
      return this;
    },
    delete(name: string) {
      incoming.delete(name);
      outgoing.delete(name);
      return this;
    },
  };
}
export function appendContextCookies(response: Response) {
  const cookies = storage.getStore()?.responseHeaders.getSetCookie() ?? [];
  if (!cookies.length) return response;
  const result = new Response(response.body, response);
  for (const cookie of cookies) result.headers.append('Set-Cookie', cookie);
  return result;
}

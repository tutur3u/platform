import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { NextResponse } from 'next/dist/server/web/spec-extension/response';
import {
  type CalendarRequestContext,
  withCalendarRequest,
} from './request-context';
import { requestInit } from './request-init';

type Proxy = (request: NextRequest) => Promise<NextResponse>;
type Dispatch = (request: NextRequest) => Promise<Response>;

function appendCookies(from: Headers, to: Headers) {
  for (const value of from.getSetCookie()) to.append('set-cookie', value);
}

export function proxyMatches(pathname: string) {
  return (
    !/^\/(?:_next\/(?:static|image)|favicon\.ico|robots\.txt|sitemap\.xml|site\.webmanifest|monitoring)/u.test(
      pathname
    ) && !/\.(?:svg|png|jpg|jpeg|pdf|gif|webp)$/u.test(pathname)
  );
}

export async function dispatchThroughCalendarProxy({
  request,
  proxy,
  dispatch,
  waitUntil,
  cloudflare,
  telemetry,
}: {
  request: Request;
  proxy: Proxy;
  dispatch: Dispatch;
  waitUntil: (work: Promise<unknown>) => void;
  cloudflare?: CalendarRequestContext['cloudflare'];
  telemetry?: CalendarRequestContext['telemetry'];
}) {
  const initial = new NextRequest(request);
  const responseHeaders = new Headers();
  return withCalendarRequest(
    { request: initial, responseHeaders, waitUntil, cloudflare, telemetry },
    async () => {
      const middleware = proxyMatches(initial.nextUrl.pathname)
        ? await proxy(initial)
        : null;
      if (
        middleware &&
        !middleware.headers.has('x-middleware-next') &&
        !middleware.headers.has('x-middleware-rewrite')
      ) {
        appendCookies(responseHeaders, middleware.headers);
        return middleware;
      }

      const forwarded = new Headers(initial.headers);
      const overridden = middleware?.headers.get(
        'x-middleware-override-headers'
      );
      if (overridden !== null && overridden !== undefined) {
        const names = new Set(
          overridden.split(',').map((name) => name.trim().toLowerCase())
        );
        for (const name of [...forwarded.keys()])
          if (!names.has(name)) forwarded.delete(name);
        for (const name of names) {
          const value = middleware?.headers.get(`x-middleware-request-${name}`);
          if (value !== null && value !== undefined) forwarded.set(name, value);
        }
      }
      const rewrite = middleware?.headers.get('x-middleware-rewrite');
      const destination = rewrite
        ? new URL(rewrite, initial.url)
        : new URL(initial.url);
      if (destination.origin !== initial.nextUrl.origin)
        throw new Error('Unexpected external Calendar middleware rewrite');
      const next = new NextRequest(
        destination,
        requestInit(initial, forwarded)
      );
      const result = await withCalendarRequest(
        { request: next, responseHeaders, waitUntil, cloudflare, telemetry },
        () => dispatch(next)
      );
      const merged = new Headers(result.headers);
      if (middleware) {
        for (const [name, value] of middleware.headers) {
          if (name !== 'set-cookie' && !name.startsWith('x-middleware-'))
            merged.set(name, value);
        }
        appendCookies(middleware.headers, merged);
      }
      for (const [name, value] of responseHeaders)
        if (name !== 'set-cookie') merged.set(name, value);
      appendCookies(responseHeaders, merged);
      const response = new Response(result.body, result);
      for (const name of [...response.headers.keys()])
        response.headers.delete(name);
      for (const [name, value] of merged)
        if (name !== 'set-cookie') response.headers.set(name, value);
      appendCookies(merged, response.headers);
      return response;
    }
  );
}

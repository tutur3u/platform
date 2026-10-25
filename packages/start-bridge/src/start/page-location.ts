import { notFound, redirect } from '@tanstack/router-core';
import { maybeBridgeRequest } from '../core/request-context';
import { dispatchThroughProxy, type NextProxy } from '../next/proxy-bridge';

/**
 * The app-relative location a page should render for, honouring the app's
 * `proxy.ts` rewrites like Next while the browser keeps the visible URL.
 *
 * - Document requests (SSR): the bridge handler already ran the proxy, and
 *   the request in the bridge context is the one the app sees (rewritten).
 * - Client navigation arrives as a server-function request, which no app
 *   proxy saw, so the proxy runs here for the target: a rewrite re-targets
 *   the page, a redirect becomes a Start redirect, and any other terminal
 *   response reloads the document so the server answers it exactly.
 */
export interface PageLocationOptions {
  /** The app's `proxy.ts` export; without it navigation is not proxied. */
  proxy?: NextProxy;
  /** App-relative server-function base (default `/_serverFn`). */
  serverFnBase?: string;
  /** Middleware matcher over the app-relative pathname. */
  matches?: (pathname: string) => boolean;
}

const ORIGIN = 'http://bridge.invalid';
// Server-function request headers that must not reach a page navigation.
const DROPPED_HEADERS = [
  'content-length',
  'content-type',
  'x-tss-context',
  'x-tss-raw',
  'x-tss-serialized',
];

function stripBase(pathname: string, base: string) {
  return base && (pathname === base || pathname.startsWith(`${base}/`))
    ? pathname.slice(base.length) || '/'
    : pathname;
}

/** A rewrite without its own query keeps the visible one, as Next merges it. */
function located(target: URL, base: string, visible: URL) {
  return `${stripBase(target.pathname, base)}${target.search || visible.search}`;
}

export async function resolvePageLocation(
  href: string,
  options: PageLocationOptions = {}
): Promise<string> {
  const context = maybeBridgeRequest();
  if (!context) return href;
  const base = context.appBase ?? '';
  const visible = new URL(href, ORIGIN);
  const current = new URL(context.request.url);
  const functionBase = options.serverFnBase ?? '/_serverFn';
  const currentPath = stripBase(current.pathname, base);
  const isFunctionCall =
    currentPath === functionBase || currentPath.startsWith(`${functionBase}/`);
  if (!isFunctionCall) return located(current, base, visible);
  if (!options.proxy) return href;

  const documentUrl = new URL(
    `${base}${stripBase(visible.pathname, base)}${visible.search}`,
    current.origin
  );
  const headers = new Headers(context.request.headers);
  for (const name of DROPPED_HEADERS) headers.delete(name);
  headers.set('accept', 'text/html');
  let rewritten: URL | undefined;
  let response: Response;
  try {
    response = await dispatchThroughProxy({
      request: new Request(documentUrl, { headers }),
      proxy: options.proxy,
      basePath: base,
      matches: options.matches,
      waitUntil: context.waitUntil,
      cloudflare: context.cloudflare,
      dispatch: async (next) => {
        rewritten = new URL(next.url);
        return new Response(null, { status: 204 });
      },
    });
  } catch {
    // An external rewrite (or a proxy failure): let the document load decide.
    throw redirect({ href: documentUrl.href, reloadDocument: true });
  }
  // Session refreshes and other proxy cookies reach the navigation response.
  for (const cookie of response.headers.getSetCookie())
    context.responseHeaders.append('set-cookie', cookie);
  if (rewritten) return located(rewritten, base, visible);
  const location = response.headers.get('location');
  if (location && response.status >= 300 && response.status < 400)
    throw redirect({
      href: new URL(location, documentUrl).href,
      reloadDocument: true,
    });
  if (response.status === 404) throw notFound();
  throw redirect({ href: documentUrl.href, reloadDocument: true });
}

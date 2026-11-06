import { redirect as startRedirect } from '@tanstack/router-core';
import { withAppBase } from '../core/app-url';
import { OUTSIDE_APP_LOCATION_HEADER } from '../core/base-path';
import { maybeBridgeRequest } from '../core/request-context';

const ABSOLUTE = /^https?:\/\//iu;

/**
 * `redirect()` for the `next/navigation` shims. A path is app-relative and
 * gains the mount. An absolute URL keeps its target, as in Next: Start's
 * router reduces a same-origin absolute href to its path (on the apex, Web's
 * `https://tuturuuu.com/login` is same-origin with `/inventory`), which the
 * mount would then re-base into an in-app loop. The request marks that exact
 * path as outside the app, so the bridge's response finalization leaves it
 * unprefixed, and `reloadDocument` makes client navigation leave the app.
 */
export function bridgeRedirect(href: string, statusCode?: 307 | 308) {
  const status = statusCode ? { statusCode } : {};
  if (!ABSOLUTE.test(href))
    return startRedirect({ href: withAppBase(href), ...status });
  const context = maybeBridgeRequest();
  const target = new URL(href);
  if (context && target.origin === new URL(context.request.url).origin)
    context.responseHeaders.set(
      OUTSIDE_APP_LOCATION_HEADER,
      `${target.pathname}${target.search}${target.hash}`
    );
  return startRedirect({ href, reloadDocument: true, ...status });
}

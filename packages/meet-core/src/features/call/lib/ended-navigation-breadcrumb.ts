/**
 * Diagnostic breadcrumbs for the ended screen. A page that navigates away
 * (for example to about:blank) cannot log afterwards, so the trigger is logged
 * while the page is still alive. Nothing here reads a name, title, message or
 * query value: routes are reduced to a pattern and cross-origin targets to an
 * origin.
 */
const OPAQUE_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z_-]{16,})$/iu;

export function redactRoute(href: string, origin: string): string {
  try {
    const url = new URL(href, origin);
    // about:blank is the destination worth recording; blob: and data: keep
    // only their scheme.
    if (url.protocol === 'about:') return url.href;
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return url.protocol;
    if (url.origin !== origin) return url.origin;
    const path = url.pathname
      .split('/')
      .map((segment) => (OPAQUE_SEGMENT.test(segment) ? ':id' : segment))
      .join('/');
    return path.replace(/^\/r\/[^/]+/u, '/r/:code');
  } catch {
    return 'invalid-url';
  }
}

export type EndedTrigger = {
  tag: string;
  download: boolean;
  target: string | null;
  href: string | null;
};

export function describeClick(
  target: EventTarget | null,
  origin: string
): EndedTrigger | null {
  const element =
    target && 'closest' in target
      ? (target as Element).closest('a,button,[role="button"]')
      : null;
  if (!element) return null;
  const href = element.getAttribute('href');
  return {
    tag: element.tagName.toLowerCase(),
    download: element.hasAttribute('download'),
    target: element.getAttribute('target'),
    href: href === null ? null : redactRoute(href, origin),
  };
}

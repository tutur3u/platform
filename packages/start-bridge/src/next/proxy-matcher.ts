import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';

/**
 * A `proxy.ts` `config.matcher` evaluated like Next: each source compiles
 * with Next's own path-to-regexp (as `tryToParsePath` does) and is tested
 * against the app-relative pathname. Next's `_next/data` and `.rsc`
 * transport suffixes have no bridge equivalent. A matcher entry with
 * `has`/`missing` conditions cannot be decided from the path alone, so it
 * matches: running the proxy on an extra request is the safe direction.
 */
export type ProxyMatcherSource =
  | string
  | { source: string; has?: unknown; missing?: unknown; locale?: false };

export type ProxyMatcherConfig =
  | ProxyMatcherSource
  | readonly ProxyMatcherSource[];

export function createProxyMatcher(
  matcher: ProxyMatcherConfig | undefined,
  fallback: (pathname: string) => boolean
): (pathname: string) => boolean {
  if (matcher === undefined) return fallback;
  const entries = (Array.isArray(matcher) ? matcher : [matcher]).map(
    (entry: ProxyMatcherSource) => {
      const source = typeof entry === 'string' ? entry : entry.source;
      const conditional =
        typeof entry !== 'string' &&
        (entry.has !== undefined || entry.missing !== undefined);
      return { regexp: pathToRegexp(source), conditional };
    }
  );
  return (pathname) =>
    entries.some(
      ({ regexp, conditional }) => conditional || regexp.test(pathname)
    );
}

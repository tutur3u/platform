import { type BridgeRouting, localePrefixMode } from './routing';

/** Environment-neutral path helpers shared by both `next-intl/navigation` shims. */
export type Href =
  | string
  | { pathname: string; query?: Record<string, string> };

function toPath(href: Href) {
  if (typeof href === 'string') return href;
  const query = href.query ? `?${new URLSearchParams(href.query)}` : '';
  return `${href.pathname}${query}`;
}

/**
 * `localePrefix` rules: `never` keeps paths unprefixed, `as-needed` prefixes
 * non-default locales, `always` prefixes every locale.
 */
export function createLocalizedPaths<const Locales extends readonly string[]>(
  routing: BridgeRouting<Locales>
) {
  const mode = localePrefixMode(routing);
  const prefixPattern = new RegExp(
    `^/(?:${routing.locales.map((l) => l.replace(/[-]/gu, '\\-')).join('|')})(?=/|$)`,
    'u'
  );
  const strip = (path: string) => path.replace(prefixPattern, '') || '/';

  function getPathname({
    href,
    locale,
  }: {
    href: Href;
    locale: string;
  }): string {
    const path = toPath(href);
    if (!path.startsWith('/') || path.startsWith('//')) return path;
    const end = path.search(/[?#]/u);
    const suffix = end === -1 ? '' : path.slice(end);
    const bare = strip(end === -1 ? path : path.slice(0, end));
    if (mode === 'never') return `${bare}${suffix}`;
    if (mode === 'as-needed' && locale === routing.defaultLocale)
      return `${bare}${suffix}`;
    return `/${locale}${bare === '/' ? '' : bare}${suffix}`;
  }

  return { mode, strip, getPathname };
}

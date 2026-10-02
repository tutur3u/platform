import publicPaths from './public-routes.generated.json';

/** Generated from concrete, indexable public page metadata at dev/build time. */
export const PUBLIC_SEO_ROUTES = publicPaths.map((pathname) => ({ pathname }));

/** Routes advertised by the static manifest or publication-aware sitemap reader. */
export function isPublicSeoPathname(pathname: string) {
  return (
    PUBLIC_SEO_ROUTES.some((route) => route.pathname === pathname) ||
    /^\/changelog\/[^/]+$/u.test(pathname)
  );
}

export function getPublicLocalizedPath(pathname: string, locale: 'en' | 'vi') {
  const normalizedPathname = pathname === '/' ? '' : pathname;
  const localePrefix = locale === 'en' ? '' : '/vi';
  return `${localePrefix}${normalizedPathname}` || '/';
}

import publicPaths from './public-routes.generated.json';

/** Generated from concrete, indexable public page metadata at dev/build time. */
export const PUBLIC_SEO_ROUTES = publicPaths.map((pathname) => ({ pathname }));

export function getPublicLocalizedPath(pathname: string, locale: 'en' | 'vi') {
  const normalizedPathname = pathname === '/' ? '' : pathname;
  const localePrefix = locale === 'en' ? '' : '/vi';
  return `${localePrefix}${normalizedPathname}` || '/';
}

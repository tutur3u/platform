import type { MetadataRoute } from 'next';

export interface PublicSeoRoute {
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]['changeFrequency']
  >;
  pathname: string;
  priority: number;
}

export const PUBLIC_SEO_ROUTES = [
  { pathname: '/', changeFrequency: 'weekly', priority: 1 },
  { pathname: '/about', changeFrequency: 'monthly', priority: 0.8 },
  { pathname: '/acceptable-use', changeFrequency: 'yearly', priority: 0.4 },
  { pathname: '/blog', changeFrequency: 'weekly', priority: 0.8 },
  { pathname: '/branding', changeFrequency: 'yearly', priority: 0.5 },
  { pathname: '/careers', changeFrequency: 'weekly', priority: 0.7 },
  { pathname: '/changelog', changeFrequency: 'weekly', priority: 0.8 },
  {
    pathname: '/community-guidelines',
    changeFrequency: 'yearly',
    priority: 0.4,
  },
  { pathname: '/contact', changeFrequency: 'yearly', priority: 0.6 },
  { pathname: '/meet', changeFrequency: 'monthly', priority: 0.6 },
  { pathname: '/meet-together', changeFrequency: 'monthly', priority: 0.6 },
  { pathname: '/models', changeFrequency: 'weekly', priority: 0.7 },
  { pathname: '/partners', changeFrequency: 'monthly', priority: 0.6 },
  { pathname: '/privacy', changeFrequency: 'yearly', priority: 0.4 },
  { pathname: '/products/ai', changeFrequency: 'monthly', priority: 0.8 },
  {
    pathname: '/products/calendar',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  { pathname: '/products/crm', changeFrequency: 'monthly', priority: 0.8 },
  {
    pathname: '/products/documents',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  { pathname: '/products/drive', changeFrequency: 'monthly', priority: 0.8 },
  {
    pathname: '/products/finance',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    pathname: '/products/inventory',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  { pathname: '/products/lms', changeFrequency: 'monthly', priority: 0.8 },
  { pathname: '/products/mail', changeFrequency: 'monthly', priority: 0.8 },
  { pathname: '/products/tasks', changeFrequency: 'monthly', priority: 0.8 },
  {
    pathname: '/products/workflows',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  { pathname: '/security', changeFrequency: 'monthly', priority: 0.7 },
  {
    pathname: '/security/bug-bounty',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    pathname: '/security/policy',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    pathname: '/solutions/construction',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/education',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/healthcare',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/hospitality',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/manufacturing',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/pharmacies',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/realestate',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/restaurants',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    pathname: '/solutions/retail',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  { pathname: '/terms', changeFrequency: 'yearly', priority: 0.4 },
  {
    pathname: '/visualizations/horse-racing',
    changeFrequency: 'yearly',
    priority: 0.5,
  },
  { pathname: '/women-in-tech', changeFrequency: 'yearly', priority: 0.6 },
] satisfies PublicSeoRoute[];

export function getPublicLocalizedPath(pathname: string, locale: 'en' | 'vi') {
  const normalizedPathname = pathname === '/' ? '' : pathname;
  const localePrefix = locale === 'en' ? '' : '/vi';

  return `${localePrefix}${normalizedPathname}` || '/';
}

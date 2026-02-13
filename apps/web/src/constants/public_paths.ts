import { supportedLocales } from '@/i18n/routing';

export const APP_PUBLIC_PATHS = [
  '/account/delete',
  '/invite',
  '/home',
  '/login',
  '/logout',
  '/pricing',
  '/about',
  '/contact',
  '/features',
  '/products',
  '/solutions',
  '/careers',
  '/partners',
  '/security',
  '/security/bug-bounty',
  '/contributors',
  '/blog',
  '/faq',
  '/terms',
  '/privacy',
  '/branding',
  '/changelog',
  '/ai/chats',
  '/qr-generator',
  '/documents',
  '/meet',
  '/meet-together',
  '/women-in-tech',
  '/vietnamese-womens-day',
  '/visualizations/horse-racing',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

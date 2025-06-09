import { supportedLocales } from '@/i18n/routing';

export const APP_PUBLIC_PATHS = [
  '/home',
  '/login',
  '/pricing',
  '/about',
  '/contact',
  '/features',
  '/products',
  '/solutions',
  '/careers',
  '/security',
  '/security/bug-bounty',
  '/contributors',
  '/blog',
  '/faq',
  '/terms',
  '/privacy',
  '/branding',
  '/ai/chats',
  '/qr-generator',
  '/documents',
  '/meet-together',
  '/visualizations/horse-racing',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

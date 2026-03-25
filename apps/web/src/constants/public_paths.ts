import { supportedLocales } from '@/i18n/routing';

export const APP_PUBLIC_PATHS = [
  '/about',
  '/achievements',
  '/branding',
  '/contributors',
  '/login',
  '/meet-together',
  '/neo-generator',
  '/neo-meeting-agent',
  '/projects',
  '/neo-crush',
  '/neo-chess',
  '/blogs',
  '/neo-pacman',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

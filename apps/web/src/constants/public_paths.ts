import { supportedLocales } from '@/i18n/routing';

export const APP_PUBLIC_PATHS = [
  '/login',
  '/about',
  '/achievements',
  '/contributors',
  '/projects',
  '/meet-together',
  '/neo-crush',
  '/neo-chess',
  '/neo-pacman',
  '/neo-generator',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

import { locales } from '@/config';

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const BASE_URL =
  process.env.BASE_URL || PROD_MODE
    ? 'https://tuturuuu.com'
    : 'http://localhost:7803';

export const API_URL =
  process.env.API_URL || PROD_MODE
    ? 'https://tuturuuu.com/api'
    : 'http://localhost:7803/api';

export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const THEME_COOKIE_NAME = 'NEXT_THEME';

export const ENABLE_KEYBOARD_SHORTCUTS = false;

// The following option only works in development mode.
// Defaults to true when not specified.
export const SHOW_TAILWIND_INDICATOR =
  process.env.SHOW_TAILWIND_INDICATOR === 'true';

export const PUBLIC_PATHS = [
  '/login',
  '/about',
  '/projects',
  '/neo-crush',
  '/neo-chess',
  '/terms',
  '/privacy',
  '/branding',
  '/ai/chats',
  '/qr-generator',
  '/calendar/meet-together',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = locales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

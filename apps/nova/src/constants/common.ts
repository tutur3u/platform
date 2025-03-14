import { supportedLocales } from '@/i18n/routing';

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const BASE_URL =
  process.env.BASE_URL || PROD_MODE
    ? 'https://tuturuuu.com'
    : 'http://localhost:7805';

export const API_URL =
  process.env.API_URL || PROD_MODE
    ? 'https://tuturuuu.com/api'
    : 'http://localhost:7805/api';

export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const THEME_COOKIE_NAME = 'NEXT_THEME';
export const SIDEBAR_COLLAPSED_COOKIE_NAME = 'NEXT_SIDEBAR_COLLAPSED';
export const SIDEBAR_SIZE_COOKIE_NAME = 'NEXT_SIDEBAR_SIZE';
export const MAIN_CONTENT_SIZE_COOKIE_NAME = 'NEXT_MAIN_CONTENT_SIZE';

export const ENABLE_KEYBOARD_SHORTCUTS = false;

// The following option only works in development mode.
// Defaults to true when not specified.
export const SHOW_TAILWIND_INDICATOR =
  process.env.SHOW_TAILWIND_INDICATOR === 'true';

export const HIDE_TAILWIND_INDICATOR =
  process.env.HIDE_TAILWIND_INDICATOR === 'true';

export const IS_PRODUCTION_DB =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('.supabase.');

export const PUBLIC_PATHS = [
  '/pricing',
  '/about',
  '/contact',
  '/features',
  '/products',
  '/solutions',
  '/learn',
  '/blog',
  '/faq',
  '/terms',
  '/privacy',
  '/branding',
  '/ai/chats',
  '/qr-generator',
  '/documents',
  '/meet-together',
].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

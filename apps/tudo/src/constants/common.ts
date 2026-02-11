import { supportedLocales } from '@/i18n/routing';

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const PORT = process.env.PORT || 7809;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

export const BASE_URL =
  process.env.BASE_URL || PROD_MODE
    ? 'https://tasks.tuturuuu.com'
    : `http://localhost:${PORT}`;

export const API_URL =
  process.env.API_URL || PROD_MODE
    ? 'https://tasks.tuturuuu.com/api'
    : `http://localhost:${PORT}/api`;

export const TTR_URL =
  process.env.TTR_URL || PROD_MODE
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`;

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const THEME_COOKIE_NAME = 'NEXT_THEME';

// The following option only works in development mode.
// Defaults to true when not specified.
export const SHOW_TAILWIND_INDICATOR =
  process.env.SHOW_TAILWIND_INDICATOR === 'true';

export const PUBLIC_PATHS = ['/verify-token'].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);

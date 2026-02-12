// Re-export shared constants from satellite package
// Re-export shared constants from satellite package
export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  PUBLIC_PATHS,
  SHOW_TAILWIND_INDICATOR,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

// App-specific constants
export const PORT = process.env.PORT || 7806;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

export const BASE_URL =
  process.env.BASE_URL || process.env.NODE_ENV === 'production'
    ? 'https://calendar.tuturuuu.com'
    : `http://localhost:${PORT}`;

export const API_URL =
  process.env.API_URL || process.env.NODE_ENV === 'production'
    ? 'https://calendar.tuturuuu.com/api'
    : `http://localhost:${PORT}/api`;

export const TTR_URL =
  process.env.TTR_URL || process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`;

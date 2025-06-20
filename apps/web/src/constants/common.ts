import { APP_PUBLIC_PATHS } from './public_paths';

export const GITHUB_OWNER = 'tutur3u';
export const GITHUB_REPO = 'platform';

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const PUBLIC_PATHS = APP_PUBLIC_PATHS;

export const BASE_URL =
  process.env.BASE_URL ||
  (PROD_MODE ? 'https://tuturuuu.com' : 'http://localhost:7803');

export const API_URL =
  process.env.API_URL ||
  (PROD_MODE ? 'https://tuturuuu.com/api' : 'http://localhost:7803/api');

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const THEME_COOKIE_NAME = 'NEXT_THEME';
export const SIDEBAR_COLLAPSED_COOKIE_NAME = 'sidebar-collapsed';
export const SIDEBAR_SIZE_COOKIE_NAME = 'sidebar-size';
export const MAIN_CONTENT_SIZE_COOKIE_NAME = 'main-content-size';
export const SIDEBAR_BEHAVIOR_COOKIE_NAME = 'sidebar-behavior';

export const ENABLE_KEYBOARD_SHORTCUTS = false;

// The following option only works in development mode.
// Defaults to true when not specified.
export const SHOW_TAILWIND_INDICATOR =
  process.env.SHOW_TAILWIND_INDICATOR === 'true';

export const HIDE_TAILWIND_INDICATOR =
  process.env.HIDE_TAILWIND_INDICATOR === 'true';

export const IS_PRODUCTION_DB =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('.supabase.');

export const MAIN_CONTENT_ID = 'main-content';

export const DRAFT_NEW_POST_ID = 'new';
export const DRAFT_NEW_POST_URL = (base: string) =>
  `${base}/${DRAFT_NEW_POST_ID}`;

export const HIDE_EXPERIMENTAL_STATUS = false;

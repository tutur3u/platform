import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { DEV_MODE, PROD_MODE } from './env';
import { APP_PUBLIC_PATHS } from './public_paths';
import {
  MAIN_CONTENT_SIZE_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  SIDEBAR_SIZE_COOKIE_NAME,
} from './sidebar';

export const GITHUB_OWNER = 'tutur3u';
export const GITHUB_REPO = 'platform';

export const PORT = process.env.PORT || 7803;

export { DEV_MODE, PROD_MODE };

export const PUBLIC_PATHS = APP_PUBLIC_PATHS;

export const BASE_URL =
  process.env.BASE_URL ||
  (PROD_MODE
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${PORT}`));

export const API_URL =
  process.env.API_URL ||
  (PROD_MODE ? 'https://tuturuuu.com/api' : `${BASE_URL}/api`);

export const PROD_API_URL = 'https://tuturuuu.com/api';

export const PROD_BASE_URL = 'https://tuturuuu.com';
export const CMS_APP_URL =
  process.env.CMS_APP_URL ||
  process.env.NEXT_PUBLIC_CMS_APP_URL ||
  (PROD_MODE
    ? 'https://cms.tuturuuu.com'
    : getLocalInternalAppUrl('cms', 'http://localhost:7811'));

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const THEME_COOKIE_NAME = 'NEXT_THEME';
export {
  MAIN_CONTENT_SIZE_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  SIDEBAR_SIZE_COOKIE_NAME,
};

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

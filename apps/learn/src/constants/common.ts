export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  SHOW_TAILWIND_INDICATOR,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

export const PORT = process.env.PORT || 7812;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

export const LEARN_APP_URL =
  process.env.LEARN_APP_URL ||
  process.env.NEXT_PUBLIC_LEARN_APP_URL ||
  process.env.TULEARN_APP_URL ||
  process.env.NEXT_PUBLIC_TULEARN_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://learn.tuturuuu.com'
    : `http://localhost:${PORT}`);

export const BASE_URL =
  process.env.BASE_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://learn.tuturuuu.com'
    : `http://localhost:${PORT}`);

export const WEB_APP_URL =
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  process.env.WEB_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`);

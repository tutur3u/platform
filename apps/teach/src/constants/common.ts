export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const PORT = process.env.PORT || 7813;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
export const LEARN_PORT = process.env.LEARN_PORT || 7812;

export const BASE_URL =
  process.env.BASE_URL ||
  process.env.TEACH_APP_URL ||
  process.env.NEXT_PUBLIC_TEACH_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://teach.tuturuuu.com'
    : `http://localhost:${PORT}`);

export const WEB_APP_URL =
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  process.env.WEB_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`);

export const LEARN_APP_URL =
  process.env.NEXT_PUBLIC_LEARN_APP_URL ||
  process.env.LEARN_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://learn.tuturuuu.com'
    : `http://localhost:${LEARN_PORT}`);

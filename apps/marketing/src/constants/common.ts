export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const PORT = process.env.PORT || 7836;

export const GITHUB_OWNER = 'tutur3u';
export const GITHUB_REPO = 'platform';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const PROD_BASE_URL = 'https://tuturuuu.com';

export const BASE_URL =
  process.env.NEXT_PUBLIC_MARKETING_APP_URL ||
  (PROD_MODE ? PROD_BASE_URL : `http://localhost:${PORT}`);

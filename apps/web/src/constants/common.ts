import { version } from '../core/version';

export const APP_VERSION = version;
export const DEV_MODE = process.env.NODE_ENV === 'development';
export const AUTH_COOKIE_DOMAIN = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
export const DEPLOYMENT_ENVIRONMENT =
  process.env.DEPLOYMENT_ENVIRONMENT || 'DEVELOPMENT';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:7803';
export const AUTH_URL = process.env.AUTH_URL || 'http://localhost:7802';
export const API_URL = process.env.API_URL || 'http://localhost:7801';

export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

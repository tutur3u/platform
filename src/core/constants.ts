import { version } from './version';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:7803';
export const AUTH_URL = process.env.AUTH_URL || 'http://localhost:7802';
export const API_URL = process.env.API_URL || 'http://localhost:7801';

export const APP_VERSION = version;

export const AUTH_COOKIE_NAME = 'tuturuuu-auth';

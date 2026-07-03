import { serverLogger } from '@/lib/infrastructure/log-drain';

const OAUTH_DEBUG_ENV_KEY = 'TUTURUUU_CALENDAR_OAUTH_DEBUG';

export function calendarOAuthDebug(...args: unknown[]) {
  if (process.env[OAUTH_DEBUG_ENV_KEY] !== '1') {
    return;
  }

  serverLogger.debug(...args);
}

export function calendarOAuthError(...args: unknown[]) {
  serverLogger.error(...args);
}

const OAUTH_DEBUG_ENV_KEY = 'TUTURUUU_CALENDAR_OAUTH_DEBUG';

export function calendarOAuthDebug(...args: unknown[]) {
  if (process.env[OAUTH_DEBUG_ENV_KEY] !== '1') {
    return;
  }

  console.debug(...args);
}

export function calendarOAuthError(...args: unknown[]) {
  console.error(...args);
}

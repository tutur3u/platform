import { InternalApiError } from '@tuturuuu/internal-api';

export function startupErrorKey(error: unknown) {
  if (error instanceof InternalApiError) {
    if (error.status === 401) return 'startup_sign_in';
    if (error.status === 403) return 'startup_blocked';
    if (error.status === 404) return 'startup_missing';
  }
  return 'startup_unavailable';
}

/** Never replay a switch-device command or an authorization failure. */
export function retryStartup(
  failures: number,
  error: unknown,
  switching: boolean
) {
  return (
    !switching &&
    failures < 2 &&
    (!(error instanceof InternalApiError) ||
      error.status >= 500 ||
      error.status === 429)
  );
}

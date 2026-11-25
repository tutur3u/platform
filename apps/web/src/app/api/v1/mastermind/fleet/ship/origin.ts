import { getBearerAccessToken } from '@tuturuuu/supabase/next/server';
import { SHARED_APP_ORIGIN } from '@tuturuuu/utils/app-mounts';

/** Call after withSessionAuth has verified the caller. */
export function hasShipRequestOrigin(
  request: Request,
  appSessionToken: string | undefined
): boolean {
  const bearer = getBearerAccessToken(request);
  // Supabase authenticates the bearer when supplied. App-session verification
  // can fall back to a cookie, so require the bearer to match the selected token.
  if (bearer && (appSessionToken === undefined || bearer === appSessionToken))
    return true;

  if (new URL(request.url).origin !== SHARED_APP_ORIGIN) return false;
  const origin = request.headers.get('origin');
  return origin === null
    ? request.headers.get('sec-fetch-site') === 'same-origin'
    : origin === SHARED_APP_ORIGIN;
}

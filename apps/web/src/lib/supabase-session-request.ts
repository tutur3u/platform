import {
  APP_SESSION_COOKIE_NAME,
  hasSupportedSupabaseAuthCookie,
} from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';

const APP_SESSION_BEARER_PREFIX = 'Bearer ttr_app_';

/**
 * Notification routes that prefer the browser Supabase identity still receive
 * Chat's host app-session cookie or the `ttr_app_` bearer the satellite proxy
 * attaches. `createClient` treats either marker as an app session and returns
 * an anonymous client, so a signed-in Supabase cookie becomes a 401.
 * Drop those markers before that read. The app session stays ineligible while
 * the Supabase cookie is present.
 */
export function supabaseSessionRequest(
  request: NextRequest,
  options?: { preferSupabaseSessionAuth?: boolean }
): NextRequest {
  if (
    !options?.preferSupabaseSessionAuth ||
    !hasSupportedSupabaseAuthCookie(request)
  ) {
    return request;
  }

  const headers = new Headers(request.headers);
  const authorization = headers.get('authorization');
  if (authorization?.startsWith(APP_SESSION_BEARER_PREFIX)) {
    headers.delete('authorization');
  }

  const cookie = headers.get('cookie');
  if (cookie) {
    const nextCookie = cookie
      .split(';')
      .map((part) => part.trim())
      .filter(
        (part) =>
          part.length > 0 && !part.startsWith(`${APP_SESSION_COOKIE_NAME}=`)
      )
      .join('; ');
    if (nextCookie) headers.set('cookie', nextCookie);
    else headers.delete('cookie');
  }

  return new NextRequest(request.url, {
    headers,
    method: request.method,
  });
}

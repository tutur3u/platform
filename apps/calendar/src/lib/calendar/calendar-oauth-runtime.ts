import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/common';

const UNAVAILABLE_MESSAGE = 'Calendar connection is temporarily unavailable';

export function isCalendarOAuthProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Public origin of the Calendar satellite, which serves each workspace
 * calendar at its configured base followed by `/{wsId}`. It comes from the app's trusted `BASE_URL` constant
 * (configured Calendar URLs, else the registered production domain), never
 * from the request URL, Host or forwarded headers.
 */
export function resolveCalendarPublicOrigin(baseUrl: string = BASE_URL) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? `${url.origin}${url.pathname.replace(/\/+$/u, '')}`
      : null;
  } catch {
    return null;
  }
}

export type CalendarOAuthRuntime =
  | { ok: true; publicOrigin: string }
  | { ok: false; response: NextResponse };

/**
 * Resolve the redirect origin for a calendar OAuth start or callback. An
 * unusable origin fails closed with a generic 503 and a server log.
 */
export function checkCalendarOAuthRuntime(
  baseUrl: string = BASE_URL
): CalendarOAuthRuntime {
  const publicOrigin = resolveCalendarPublicOrigin(baseUrl);

  if (!publicOrigin) {
    console.error('Calendar OAuth is misconfigured: invalid Calendar BASE_URL');
    return {
      ok: false,
      response: NextResponse.json(
        { error: UNAVAILABLE_MESSAGE },
        { status: 503 }
      ),
    };
  }

  return { ok: true, publicOrigin };
}

/**
 * Build a post-OAuth browser redirect on the Calendar public origin. Without a
 * verified workspace the redirect falls back to the configured app base.
 */
export function buildCalendarPostAuthRedirectUrl(
  publicOrigin: string,
  wsId: string | null,
  searchParams: Record<string, string>
) {
  const workspace = wsId && wsId !== '.' && wsId !== '..' ? wsId : null;
  const base = publicOrigin.replace(/\/+$/u, '');
  const redirectUrl = workspace
    ? new URL(encodeURIComponent(workspace), `${base}/`)
    : new URL(base);

  for (const [key, value] of Object.entries(searchParams)) {
    redirectUrl.searchParams.set(key, value);
  }

  return redirectUrl;
}

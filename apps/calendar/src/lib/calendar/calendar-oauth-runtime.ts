import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { NextResponse } from 'next/server';

export const CALENDAR_PUBLIC_URL_ENV_KEYS = [
  'CALENDAR_APP_URL',
  'NEXT_PUBLIC_CALENDAR_APP_URL',
] as const;
export const CALENDAR_OAUTH_REPLAY_STORE_ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

const UNAVAILABLE_MESSAGE = 'Calendar connection is temporarily unavailable';

export function isCalendarOAuthProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

export function missingCalendarOAuthReplayStoreEnv() {
  return CALENDAR_OAUTH_REPLAY_STORE_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim()
  );
}

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Public origin of the Calendar satellite, which serves each workspace
 * calendar at `/{wsId}`. Only deployment configuration is trusted (never the
 * request URL, Host or forwarded headers). Production has no hard-coded
 * fallback: a missing origin returns null so callers fail closed.
 */
export function resolveCalendarPublicOrigin() {
  const configured = resolveInternalAppUrl({
    appName: 'calendar',
    candidates: CALENDAR_PUBLIC_URL_ENV_KEYS.map((key) => process.env[key]),
    fallback: '',
  });
  const configuredOrigin = configured ? originOf(configured) : null;

  if (configuredOrigin) return configuredOrigin;
  if (isCalendarOAuthProductionRuntime()) return null;

  return originOf(
    getLocalInternalAppUrl(
      'calendar',
      `http://localhost:${process.env.PORT || 7806}`
    )
  );
}

export type CalendarOAuthRuntime =
  | { ok: true; publicOrigin: string }
  | { ok: false; response: NextResponse };

/**
 * Check the deployment prerequisites for a calendar OAuth start or callback.
 * Production requires the Upstash single-use state store and a configured
 * Calendar public origin; either gap fails closed with a generic 503 and a
 * server log naming the missing variables (never their values).
 */
export function checkCalendarOAuthRuntime(): CalendarOAuthRuntime {
  const missing: string[] = [];

  if (isCalendarOAuthProductionRuntime()) {
    missing.push(...missingCalendarOAuthReplayStoreEnv());
  }

  const publicOrigin = resolveCalendarPublicOrigin();
  if (!publicOrigin) {
    missing.push(`one of ${CALENDAR_PUBLIC_URL_ENV_KEYS.join(' or ')}`);
  }

  if (missing.length > 0 || !publicOrigin) {
    console.error(
      `Calendar OAuth is misconfigured; missing environment: ${missing.join(', ')}`
    );
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
 * verified workspace the redirect falls back to the origin root.
 */
export function buildCalendarPostAuthRedirectUrl(
  publicOrigin: string,
  wsId: string | null,
  searchParams: Record<string, string>
) {
  const redirectUrl = new URL(
    wsId ? `/${encodeURIComponent(wsId)}` : '/',
    publicOrigin
  );

  for (const [key, value] of Object.entries(searchParams)) {
    redirectUrl.searchParams.set(key, value);
  }

  return redirectUrl;
}

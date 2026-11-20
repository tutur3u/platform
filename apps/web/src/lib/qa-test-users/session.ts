import { type CookieOptions, createServerClient } from '@supabase/ssr';
import { getSupabaseCookieOptions } from '@tuturuuu/supabase/next/common';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { QaStore } from './store';
import { QaStoreError } from './store';

export interface QaSessionCookie {
  name: string;
  value: string;
  domain?: string;
  path: string;
  sameSite: 'Lax' | 'Strict' | 'None';
  secure: boolean;
  httpOnly: boolean;
  maxAge?: number;
}

export interface QaSessionResult {
  userId: string;
  email: string;
  runId: string;
  /** The account (and every session it holds) is deleted at this time. */
  expiresAt: string;
  origin: string;
  cookies: QaSessionCookie[];
  session: { accessToken: string; refreshToken: string; expiresAt: number };
}

export interface QaSessionDeps {
  store: QaStore;
  admin: Pick<TypedSupabaseClient, 'auth'>;
  supabaseUrl: string;
  publishableKey: string;
  cookieOptions: (origin: string) => CookieOptions & { name?: string };
  fetch?: typeof fetch;
}

function sameSite(
  value: CookieOptions['sameSite']
): QaSessionCookie['sameSite'] {
  if (value === 'strict' || value === true) return 'Strict';
  if (value === 'none') return 'None';
  return 'Lax';
}

/**
 * Mints a fresh browser session for a live QA account without its password:
 * an admin-generated magic-link token is verified server-side and the
 * resulting Supabase SSR cookies are returned for automation storage state.
 * Nothing is emailed. The mint is audited before any token exists.
 */
export async function mintQaSession(
  deps: QaSessionDeps,
  userId: string,
  operatorUserId: string,
  origin: string
): Promise<QaSessionResult> {
  const grant = await deps.store.recordSession(userId, operatorUserId);
  if (!grant) throw new QaStoreError('QA test account is not active', 404);

  const link = await deps.admin.auth.admin.generateLink({
    type: 'magiclink',
    email: grant.email,
  });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || link.data?.user?.id !== userId || !tokenHash)
    throw new QaStoreError('Unable to mint a QA session', 503);

  const jar = new Map<
    string,
    { name: string; value: string; options: CookieOptions }
  >();
  const options = deps.cookieOptions(origin);
  const client = createServerClient(deps.supabaseUrl, deps.publishableKey, {
    cookieOptions: options,
    cookies: {
      getAll: () => [...jar.values()],
      setAll: (changes) => {
        for (const cookie of changes) {
          if (cookie.options.maxAge === 0) jar.delete(cookie.name);
          else jar.set(cookie.name, cookie);
        }
      },
    },
    global: {
      fetch: (url, init) =>
        (deps.fetch ?? fetch)(url, { ...init, redirect: 'error' }),
    },
  });
  const verified = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  const session = verified.data.session;
  if (
    verified.error ||
    verified.data.user?.id !== userId ||
    verified.data.user.app_metadata?.qa_test !== true ||
    !session ||
    jar.size === 0
  ) {
    throw new QaStoreError('Unable to mint a QA session', 503);
  }

  return {
    userId,
    email: grant.email,
    runId: grant.runId,
    expiresAt: grant.expiresAt,
    origin,
    cookies: [...jar.values()].map(({ name, value, options: cookie }) => ({
      name,
      value,
      ...(cookie.domain ? { domain: cookie.domain } : {}),
      path: cookie.path ?? '/',
      sameSite: sameSite(cookie.sameSite),
      secure: Boolean(cookie.secure) || origin.startsWith('https://'),
      httpOnly: Boolean(cookie.httpOnly),
      ...(typeof cookie.maxAge === 'number' ? { maxAge: cookie.maxAge } : {}),
    })),
    session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? 0,
    },
  };
}

/**
 * A requested origin must share this deployment's session cookie scope, so a
 * minted session can only be used against first-party Tuturuuu apps.
 */
export function resolveSessionOrigin(
  requestOrigin: string,
  requested: string | undefined,
  supabaseUrl: string
) {
  if (!requested) return requestOrigin;
  const origin = new URL(requested).origin;
  if (origin === requestOrigin) return origin;
  const scope = getSupabaseCookieOptions(supabaseUrl, requestOrigin).domain;
  const candidate = getSupabaseCookieOptions(supabaseUrl, origin);
  return scope && candidate.domain === scope && origin.startsWith('https://')
    ? origin
    : null;
}

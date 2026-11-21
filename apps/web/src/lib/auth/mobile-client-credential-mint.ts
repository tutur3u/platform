import {
  TurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/cloudflare/turnstile/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { isAuthBackendUnavailableError } from '@tuturuuu/utils/abuse-protection/backend-rate-limit';
import { MAX_LONG_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isBrowserRequest,
  refuseMobileSessionForBrowser,
} from './browser-request';
import {
  createMobileClientCredential,
  getRequestBearerToken,
  mobileClientSessionBinding,
  readSupabaseSessionId,
} from './mobile-client-credential';

export const MOBILE_CLIENT_CREDENTIAL_ENDPOINT =
  '/api/v1/auth/mobile/client-credential';
/** Turnstile `action` the mobile widget must set for this endpoint. */
export const MOBILE_CLIENT_TURNSTILE_ACTION = 'mobile_client_credential';

const MintSchema = z
  .object({ captchaToken: z.string().min(1).max(MAX_LONG_TEXT_LENGTH) })
  .strict();

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export type MobileClientCredentialMintDeps = {
  /** IP block and IP rate limit, checked before the user is resolved. */
  guardIp: () => Promise<NextResponse | null>;
  rateLimit: (userId: string) => Promise<NextResponse | null>;
  recordAuthFailure: () => void;
  resolveUser: (
    request: NextRequest
  ) => Promise<
    { ok: true; user: SupabaseUser } | { ok: false; response: NextResponse }
  >;
  /** Hostname the Turnstile widget must have been solved on. */
  turnstileHostname: () => string;
  turnstileFetch?: typeof fetch;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { headers: NO_STORE, status });
}

/**
 * Response for a bearer the auth backend did not resolve. A rate limit, 5xx
 * or transport failure is 503, so only a refused bearer reads as 401.
 */
export function mobileClientAuthFailureResponse(authError: unknown) {
  return isAuthBackendUnavailableError(authError)
    ? json({ error: 'Verification unavailable' }, 503)
    : json({ error: 'Unauthorized' }, 401);
}

/**
 * Mints a native mobile client credential for an existing Supabase-bearer
 * session (sessions created outside the password/OTP endpoints, or after the
 * previous credential expired). A fresh Turnstile pass is required, the same
 * bar as the browser step-up, and browser requests are refused so web pages
 * can never hold the credential.
 */
export async function mintMobileClientCredential(
  request: NextRequest,
  deps: MobileClientCredentialMintDeps
) {
  if (isBrowserRequest(request.headers)) {
    const refused = refuseMobileSessionForBrowser(
      MOBILE_CLIENT_CREDENTIAL_ENDPOINT
    );
    return json(refused.body, refused.status);
  }

  const blocked = await deps.guardIp();
  if (blocked) return blocked;

  const auth = await deps.resolveUser(request);
  if (!auth.ok) {
    // Only a refused credential counts; an auth outage or 429 is not abuse.
    if (auth.response.status === 401) deps.recordAuthFailure();
    return auth.response;
  }

  const sessionId = readSupabaseSessionId(
    getRequestBearerToken(request.headers),
    auth.user.id
  );
  if (!sessionId) {
    deps.recordAuthFailure();
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await deps.rateLimit(auth.user.id);
  if (limited) return limited;

  const parsed = MintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request body' }, 400);

  try {
    // Purpose-bound: the solve must name this endpoint's action and carry
    // this session's binding as cData, so a token from login or any other
    // widget cannot be replayed here.
    await verifyTurnstileToken(request, parsed.data.captchaToken, {
      devMode: false,
      expectedAction: MOBILE_CLIENT_TURNSTILE_ACTION,
      expectedCData: mobileClientSessionBinding(sessionId),
      expectedHostname: deps.turnstileHostname(),
      fetch: deps.turnstileFetch,
      timeoutMs: 5000,
    });
  } catch (error) {
    if (error instanceof TurnstileError && error.code === 'not_configured') {
      return json({ error: 'Verification unavailable' }, 503);
    }
    return json(
      { code: 'ABUSE_CHALLENGE_REQUIRED', error: 'Verification failed' },
      403
    );
  }

  const { expiresAt, token } = createMobileClientCredential({
    sessionId,
    userId: auth.user.id,
  });

  return json({ mobile_client: { expires_at: expiresAt, token } }, 200);
}

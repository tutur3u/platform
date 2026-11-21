import {
  TurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/cloudflare/turnstile/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
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
  readSupabaseSessionId,
} from './mobile-client-credential';

export const MOBILE_CLIENT_CREDENTIAL_ENDPOINT =
  '/api/v1/auth/mobile/client-credential';

const MintSchema = z
  .object({ captchaToken: z.string().min(1).max(MAX_LONG_TEXT_LENGTH) })
  .strict();

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export type MobileClientCredentialMintDeps = {
  rateLimit: (userId: string) => Promise<NextResponse | null>;
  resolveUser: (
    request: NextRequest
  ) => Promise<
    { ok: true; user: SupabaseUser } | { ok: false; response: NextResponse }
  >;
  verifyTurnstile?: (request: NextRequest, token: string) => Promise<void>;
};

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { headers: NO_STORE, status });
}

async function defaultVerifyTurnstile(request: NextRequest, token: string) {
  await verifyTurnstileToken(request, token, { timeoutMs: 5000 });
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

  const auth = await deps.resolveUser(request);
  if (!auth.ok) return auth.response;

  const sessionId = readSupabaseSessionId(
    getRequestBearerToken(request.headers),
    auth.user.id
  );
  if (!sessionId) return json({ error: 'Unauthorized' }, 401);

  const limited = await deps.rateLimit(auth.user.id);
  if (limited) return limited;

  const parsed = MintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request body' }, 400);

  try {
    await (deps.verifyTurnstile ?? defaultVerifyTurnstile)(
      request,
      parsed.data.captchaToken
    );
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
    email: auth.user.email,
    sessionId,
    userId: auth.user.id,
  });

  return json({ mobile_client: { expires_at: expiresAt, token } }, 200);
}

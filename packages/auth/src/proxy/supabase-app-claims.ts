import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getConfirmedAuthEmail } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { getRequestVerifiedUser } from '@tuturuuu/utils/request-verified-user';
import { accountAssuranceCredentials } from '@tuturuuu/utils/required-mfa-credentials';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { resolveVerifiedSupabaseMfa } from '@tuturuuu/utils/required-mfa-supabase-session';
import type { NextRequest } from 'next/server';
import type { AppCoordinationTokenClaims } from '../app-coordination';
import { APP_SESSION_SCOPE } from '../app-session';

/**
 * SR-926: a re-minted app session carries the confirmed Auth email for this
 * subject, read server-side on every mint. Provider-session `email` claims are
 * never carried forward. Reuses this request's revalidated user for its one
 * provider session; otherwise reads Auth by ID. Throws when Auth cannot be
 * read, which the proxy turns into a 503.
 */
async function resolveConfirmedSessionEmail(
  sub: string,
  request: NextRequest | undefined
) {
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const providerTokens = request
    ? accountAssuranceCredentials(request).filter((t) => t.startsWith('eyJ'))
    : [];
  if (providerTokens.length === 1 && request) {
    const [token] = providerTokens as [string];
    const verified = await getRequestVerifiedUser(request, token, () =>
      admin.auth.getUser(token)
    ).catch(() => null);
    if (!verified?.error && verified?.data.user?.id === sub)
      return getConfirmedAuthEmail(verified.data.user);
  }
  const { data, error } = await admin.auth.admin.getUserById(sub);
  if (error || !data.user || data.user.id !== sub)
    throw new Error('Account assurance unavailable');
  return getConfirmedAuthEmail(data.user);
}

export async function createAppSessionClaimsFromSupabaseClaims(
  claims: unknown,
  options: {
    now: Date;
    targetApp: AppName | string;
    /** Incoming request, so the policy lookup is shared request-wide. */
    request?: NextRequest;
  }
): Promise<AppCoordinationTokenClaims | null> {
  const record =
    claims && typeof claims === 'object' && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : {};
  const sub = typeof record.sub === 'string' ? record.sub : null;

  if (!sub) {
    return null;
  }

  const assurance = await resolveVerifiedSupabaseMfa(record, options.request);
  if (assurance.status !== 'allowed') return null;
  const email = await resolveConfirmedSessionEmail(sub, options.request);

  const nowSeconds = Math.floor(options.now.getTime() / 1000);
  const exp = typeof record.exp === 'number' ? record.exp : nowSeconds + 3600;
  const iat = typeof record.iat === 'number' ? record.iat : nowSeconds;
  const sessionId =
    typeof record.session_id === 'string' ? record.session_id : null;

  return {
    aud: 'tuturuuu-api',
    email,
    exp,
    iat,
    iss: 'tuturuuu',
    mfa:
      assurance.proof ??
      mfaProofFromVerifiedClaims(record, nowSeconds) ??
      undefined,
    jti: sessionId ?? `supabase:${sub}:${iat}`,
    origin_app: 'web',
    scopes: [APP_SESSION_SCOPE],
    sub,
    target_app: options.targetApp,
    typ: 'app_coordination',
  };
}

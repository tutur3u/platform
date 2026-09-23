import type { AppName } from '@tuturuuu/utils/internal-domains';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { resolveVerifiedSupabaseMfa } from '@tuturuuu/utils/required-mfa-supabase-session';
import type { AppCoordinationTokenClaims } from '../app-coordination';
import { APP_SESSION_SCOPE } from '../app-session';

export async function createAppSessionClaimsFromSupabaseClaims(
  claims: unknown,
  options: {
    now: Date;
    targetApp: AppName | string;
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

  const assurance = await resolveVerifiedSupabaseMfa(record);
  if (assurance.status !== 'allowed') return null;

  const nowSeconds = Math.floor(options.now.getTime() / 1000);
  const exp = typeof record.exp === 'number' ? record.exp : nowSeconds + 3600;
  const iat = typeof record.iat === 'number' ? record.iat : nowSeconds;
  const sessionId =
    typeof record.session_id === 'string' ? record.session_id : null;

  return {
    aud: 'tuturuuu-api',
    email: typeof record.email === 'string' ? record.email : null,
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

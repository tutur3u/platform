import { createClient } from '@tuturuuu/supabase/next/server';
import {
  extractIPFromHeaders,
  isIPBlocked,
  recordApiAuthFailure,
} from '@tuturuuu/utils/abuse-protection';
import { type NextRequest, NextResponse } from 'next/server';
import {
  MOBILE_CLIENT_CREDENTIAL_ENDPOINT,
  mobileClientAuthFailureResponse,
  mintMobileClientCredential,
} from '@/lib/auth/mobile-client-credential-mint';
import { nativeIntegrityWebOrigin } from '@/lib/native-integrity/runtime';
import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit';
import { resolveTimedSessionUser } from '@/lib/server-timing';

const USER_RATE_LIMIT = { maxRequests: 10, windowMs: 10 * 60_000 };
const IP_RATE_LIMIT = { maxRequests: 30, windowMs: 10 * 60_000 };

async function limit(key: string, config: RateLimitConfig) {
  const result = await checkRateLimit(key, config);
  return 'allowed' in result ? null : result;
}

export async function POST(request: NextRequest) {
  const ipAddress = extractIPFromHeaders(request.headers);

  return mintMobileClientCredential(request, {
    guardIp: async () => {
      // An undetermined IP resolves to the shared 'unknown' bucket, which is
      // still block-checked and rate-limited, as in withSessionAuth.
      const blockInfo = await isIPBlocked(ipAddress, {
        route: MOBILE_CLIENT_CREDENTIAL_ENDPOINT,
        source: 'api-auth',
      });
      if (blockInfo) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
        );
        return NextResponse.json(
          { error: 'Too Many Requests', message: 'Rate limit exceeded' },
          { headers: { 'Retry-After': `${retryAfter}` }, status: 429 }
        );
      }
      return limit(`mobile-client-credential:ip:${ipAddress}`, IP_RATE_LIMIT);
    },
    rateLimit: (userId) =>
      limit(`mobile-client-credential:user:${userId}`, USER_RATE_LIMIT),
    recordAuthFailure: () => {
      if (ipAddress && ipAddress !== 'unknown') {
        void recordApiAuthFailure(ipAddress, MOBILE_CLIENT_CREDENTIAL_ENDPOINT);
      }
    },
    // Supabase bearer only. The failure is classified here because the shared
    // session resolver reports an auth outage as 401.
    resolveUser: async (authRequest) => {
      const { authError, user } = await resolveTimedSessionUser(
        (await createClient(authRequest)) as Parameters<
          typeof resolveTimedSessionUser
        >[0]
      );
      return user && !authError
        ? { ok: true, user }
        : { ok: false, response: mobileClientAuthFailureResponse(authError) };
    },
    turnstileHostname: () => new URL(nativeIntegrityWebOrigin()).hostname,
  });
}

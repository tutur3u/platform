import type { NextRequest } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { mintMobileClientCredential } from '@/lib/auth/mobile-client-credential-mint';
import { checkRateLimit } from '@/lib/rate-limit';

const MINT_RATE_LIMIT = { maxRequests: 10, windowMs: 10 * 60_000 };

export async function POST(request: NextRequest) {
  return mintMobileClientCredential(request, {
    rateLimit: async (userId) => {
      const result = await checkRateLimit(
        `mobile-client-credential:${userId}`,
        MINT_RATE_LIMIT
      );
      return 'allowed' in result ? null : result;
    },
    resolveUser: (authRequest) =>
      resolveSessionAuthContext(authRequest, { allowAppSessionAuth: false }),
  });
}

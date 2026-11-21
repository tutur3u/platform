import {
  APP_SESSION_SCOPE,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import {
  isMfaSessionProof,
  type MfaSessionProof,
} from '@tuturuuu/utils/required-mfa-policy';
import { connection, type NextRequest, type NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { checkRateLimitRedis, type RateLimitConfig } from '@/lib/rate-limit';
import { fleetJson } from '../session';
import { fleetOwnerUnavailable } from './owner-db';

/** The Mastermind owner gate admits one second-factor check for a day. */
export const FLEET_OWNER_MFA_MAX_AGE_SECONDS = 24 * 60 * 60;

export const FLEET_OWNER_MUTATION_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 20,
};

const mastermindSession = {
  targetApp: 'mastermind',
  requiredScope: APP_SESSION_SCOPE,
} as const;

/** A proof verified no earlier than the window and not yet expired. */
export function isFreshOwnerMfa(
  proof: MfaSessionProof | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  return (
    isMfaSessionProof(proof) &&
    proof.verifiedAt <= nowSeconds &&
    nowSeconds - proof.verifiedAt <= FLEET_OWNER_MFA_MAX_AGE_SECONDS &&
    (proof.expiresAt === undefined || proof.expiresAt > nowSeconds)
  );
}

/**
 * Owner console routes accept only a Mastermind access session whose MFA
 * proof is fresh. Supabase sessions, the platform (CLI) audience and machine
 * bearers never reach the handler. The database still decides who the Owner is.
 */
export function withFleetOwner(
  handler: (actorId: string, request: NextRequest) => Promise<NextResponse>,
  { mutation }: { mutation: boolean }
) {
  const authenticated = withSessionAuth(
    async (request, { user }) => {
      const session = verifyAppSessionRequest(request, mastermindSession);
      if (!session.ok || session.claims.sub !== user.id) {
        return fleetJson({ error: 'owner_session_required' }, 403);
      }
      if (!isFreshOwnerMfa(session.claims.mfa)) {
        return fleetJson({ error: 'mfa_required' }, 403);
      }
      if (mutation) {
        // `checkRateLimit` allows the request when its store is down.
        const limit = await checkRateLimitRedis(
          `fleet:owner:mutate:${user.id}`,
          FLEET_OWNER_MUTATION_LIMIT,
          { failClosed: true }
        );
        if (limit.unavailable) return fleetOwnerUnavailable();
        if (!limit.allowed) return fleetJson({ error: 'rate_limited' }, 429);
      }
      return handler(user.id, request);
    },
    {
      allowAppSessionAuth: mastermindSession,
      rateLimitKind: mutation ? 'mutate' : 'read',
    }
  );

  return async (request: NextRequest) => {
    await connection();
    const response = await authenticated(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}

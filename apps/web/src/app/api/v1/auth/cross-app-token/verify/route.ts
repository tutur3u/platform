import {
  APP_REDEEM_PROOF_HEADER,
  MASTERMIND_APEX_CALLBACK,
  MASTERMIND_HOST_CALLBACK,
  requiresWorkerRedeemProof,
  verifyAppRedeemProof,
  verifyMastermindHandoffIssuerProof,
} from '@tuturuuu/auth/app-redeem-proof';
import { createAppSessionTokenPair } from '@tuturuuu/auth/app-session';
import { resolveInternalAppSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import { validateCrossAppTokenWithClient } from '@tuturuuu/auth/cross-app/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AppName,
  getAppDomainMap,
} from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import {
  type ReportHandoffFailure,
  withAuthHandoffDiagnostics,
} from '@/lib/auth/handoff-diagnostics';
import {
  mastermindApexCallbackAdmitted,
  mastermindApexCallbackFlag,
  mastermindSignInTransactionRequired,
} from '@/lib/auth/mastermind-signin-transaction';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/cross-app-token/verify';

const verifyCrossAppTokenSchema = z.object({
  /**
   * Mastermind only: the exact callback the redeeming Worker serves, e.g.
   * `https://tuturuuu.com/mastermind/verify-token`. A v2 issuer proof
   * redeems only for the callback it was issued for.
   */
  callback: z.string().max(128).optional(),
  /** RFC 7636 verifier for a challenge-bound handoff (Worker-only targets). */
  codeVerifier: z
    .string()
    .regex(/^[A-Za-z0-9._~-]{43,128}$/)
    .optional(),
  issuerProof: z
    .string()
    .regex(/^(?:v2\.)?[A-Za-z0-9_-]{43}$/u)
    .optional(),
  targetApp: z.string().min(1).max(64),
  token: z.string().min(1),
});

function isRegisteredAppName(value: string): value is AppName {
  return getAppDomainMap().some((domain) => domain.name === value);
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

/**
 * Every issuer proof is checked. Its absence is refused once the signing
 * Worker serves and the transaction requirement is on, and always for the
 * apex callback. A stated callback must be the host one or the admitted apex
 * one; a redeem that states none is the dedicated host's, so a host Worker
 * that does not declare its callback keeps signing in while an apex handoff
 * never redeems there. A v2 proof redeems only for the callback it was issued
 * for, and v1 (host only) is refused while the apex flag is on.
 */
function mastermindIssuerAccepted({
  callback: declared,
  issuerProof,
  token,
}: z.infer<typeof verifyCrossAppTokenSchema>) {
  const callback = declared ?? MASTERMIND_HOST_CALLBACK;
  const apex = callback === MASTERMIND_APEX_CALLBACK;
  if (callback !== undefined && callback !== MASTERMIND_HOST_CALLBACK) {
    if (!apex || !mastermindApexCallbackAdmitted()) return false;
  }
  if (
    issuerProof === undefined &&
    !mastermindSignInTransactionRequired() &&
    !apex
  )
    return true;
  return verifyMastermindHandoffIssuerProof(token, issuerProof, {
    acceptV1: !mastermindApexCallbackFlag(),
    callback,
  });
}

async function verifyCrossAppToken(
  request: NextRequest,
  fail: ReportHandoffFailure
) {
  const body = await request.json().catch(() => null);
  const parsed = verifyCrossAppTokenSchema.safeParse(body);

  if (!parsed.success || !isRegisteredAppName(parsed.data.targetApp)) {
    return fail(
      'INVALID_VERIFICATION_PAYLOAD',
      jsonNoStore(
        { error: 'Invalid cross-app token verification payload' },
        { status: 400 }
      )
    );
  }

  const workerOnly = requiresWorkerRedeemProof(parsed.data.targetApp);
  if (workerOnly && !parsed.data.codeVerifier) {
    return fail(
      'PKCE_REQUIRED',
      jsonNoStore(
        { code: 'PKCE_REQUIRED', error: 'Missing code verifier' },
        { status: 400 }
      )
    );
  }

  if (
    workerOnly &&
    !verifyAppRedeemProof({
      targetApp: parsed.data.targetApp,
      credential: parsed.data.token,
      proof: request.headers.get(APP_REDEEM_PROOF_HEADER),
    })
  ) {
    return fail(
      'REDEEM_PROOF_REQUIRED',
      jsonNoStore({ error: 'Invalid or expired token' }, { status: 401 })
    );
  }

  if (
    parsed.data.targetApp === 'mastermind' &&
    !mastermindIssuerAccepted(parsed.data)
  ) {
    return fail(
      'ISSUER_PROOF_REQUIRED',
      jsonNoStore({ error: 'Invalid or expired token' }, { status: 401 })
    );
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const validation = await validateCrossAppTokenWithClient({
    supabase,
    targetApp: parsed.data.targetApp,
    token: parsed.data.token,
    // Only a Worker-only handoff redeems with its verifier; every other
    // target keeps the anonymous validator, which refuses bound tokens.
    ...(workerOnly ? { codeVerifier: parsed.data.codeVerifier } : {}),
  });

  if (!validation) {
    return fail(
      'TOKEN_VERIFICATION_FAILED',
      jsonNoStore({ error: 'Invalid or expired token' }, { status: 401 })
    );
  }

  const { policy } = await getAppCoordinationSessionPolicy();
  const internalAppSessionPolicy = resolveInternalAppSessionPolicy(
    policy,
    parsed.data.targetApp
  );
  // A handoff without a browser origin transfer was minted for a native
  // caller, or straight through Supabase: its sessions need AI consent.
  const aiConsentRequired = validation.aiConsentRequired !== false;
  const appSession = createAppSessionTokenPair(
    {
      aiConsentRequired,
      email: validation.sessionData?.email ?? null,
      mfa: validation.mfa ?? undefined,
      targetApp: parsed.data.targetApp,
      userId: validation.userId,
    },
    {
      policy: internalAppSessionPolicy,
    }
  );

  return jsonNoStore({
    aiConsentRequired,
    mfa: validation.mfa ?? null,
    appSessionExpiresAt: appSession.access.expiresAt,
    appSessionRefreshEarlySeconds: appSession.refreshEarlySeconds,
    appSessionRefreshExpiresAt: appSession.refresh.expiresAt,
    appSessionRefreshToken: appSession.refresh.token,
    appSessionToken: appSession.access.token,
    internalAppSessionPolicy,
    sessionData: validation.sessionData,
    userId: validation.userId,
    valid: true,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, () =>
    withAuthHandoffDiagnostics(ROUTE, (fail) =>
      verifyCrossAppToken(request, fail)
    )
  );
}

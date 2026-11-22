import {
  type AppSessionTargetApp,
  verifyAppSessionRequestWithToken,
} from '@tuturuuu/auth/app-session';
import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { rejectStaleExternalAppBearer } from './app-coordination/external-app-bearer';
import { isExternalAppClaims } from './app-coordination/reserved-app-names';
import { getDefaultAppSessionVerificationOptions } from './api-auth-audiences';

type StrictAppSessionAuthOptions = {
  requiredScope?: string | false;
  targetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[];
};

export type AppSessionAuthOptions =
  | boolean
  | StrictAppSessionAuthOptions
  | readonly StrictAppSessionAuthOptions[];

function getAppSessionVerificationOptions(
  request: Pick<NextRequest, 'url'>,
  allowAppSessionAuth:
    | true
    | StrictAppSessionAuthOptions
    | readonly StrictAppSessionAuthOptions[]
): readonly StrictAppSessionAuthOptions[] {
  if (allowAppSessionAuth === true) {
    return [getDefaultAppSessionVerificationOptions(request.url)];
  }

  return isAppSessionAuthOptionsList(allowAppSessionAuth)
    ? allowAppSessionAuth
    : [allowAppSessionAuth];
}

function isAppSessionAuthOptionsList(
  value: StrictAppSessionAuthOptions | readonly StrictAppSessionAuthOptions[]
): value is readonly StrictAppSessionAuthOptions[] {
  return Array.isArray(value);
}

export type ConfiguredAppSessionResult =
  | Extract<ReturnType<typeof verifyAppSessionRequestWithToken>, { ok: true }>
  | { ok: false; response: NextResponse };

/**
 * Verifies the request's app session against the route's configured options.
 * A bearer from an external app (no first-party session scope, no internal
 * target) is also checked against the app registry, so a disabled app or a
 * bearer issued before a secret rotation is refused here as on every other
 * external-app route.
 */
export async function verifyConfiguredAppSessionRequest(
  request: Pick<NextRequest, 'headers' | 'url'>,
  allowAppSessionAuth:
    | true
    | StrictAppSessionAuthOptions
    | readonly StrictAppSessionAuthOptions[]
): Promise<ConfiguredAppSessionResult> {
  for (const verificationOptions of getAppSessionVerificationOptions(
    request,
    allowAppSessionAuth
  )) {
    const verification = verifyAppSessionRequestWithToken(
      request,
      verificationOptions
    );

    if (verification.ok) {
      if (!isExternalAppClaims(verification.claims)) return verification;

      const rejection = await rejectStaleExternalAppBearer(
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
        verification.claims
      );
      return rejection ? { ok: false, response: rejection } : verification;
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
}

export function isCliAppSessionClaims(claims: {
  origin_app?: string | null;
  scopes?: readonly string[];
  target_app?: string | null;
}) {
  return (
    claims.origin_app === 'cli' &&
    claims.target_app === CLI_APP_TARGET_APP &&
    claims.scopes?.includes(CLI_APP_ACCESS_SCOPE) === true
  );
}

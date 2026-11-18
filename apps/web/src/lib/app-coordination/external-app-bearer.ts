import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { wasIssuedBeforeSecretRotation } from './external-app-secret-rotation';
import {
  type ExternalAppRegistration,
  getExternalAppById,
} from './external-apps';

export { wasIssuedBeforeSecretRotation } from './external-app-secret-rotation';

export type ExternalAppBearerRejection =
  | 'app_disabled'
  | 'lookup_failed'
  | 'secret_rotated';

export type ExternalAppBearerIssuerCheck =
  | { app: ExternalAppRegistration; ok: true }
  | { ok: false; reason: ExternalAppBearerRejection };

/**
 * Re-checks the registry for an external-app (`ttr_app_`) bearer: the issuing
 * app must still exist and be enabled, and the bearer must postdate the app's
 * current secret. Signature, scope and membership checks stay with the caller.
 */
export async function verifyExternalAppBearerIssuer({
  admin,
  claims,
}: {
  admin: TypedSupabaseClient;
  claims: Pick<AppCoordinationTokenClaims, 'iat' | 'target_app'>;
}): Promise<ExternalAppBearerIssuerCheck> {
  let app: ExternalAppRegistration | null;

  try {
    app = await getExternalAppById(claims.target_app, admin);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_app_id') {
      return { ok: false, reason: 'app_disabled' };
    }

    console.error('Failed to load external app registration', {
      error: error instanceof Error ? error.message : String(error),
      targetApp: claims.target_app,
    });
    return { ok: false, reason: 'lookup_failed' };
  }

  if (!app?.enabled) return { ok: false, reason: 'app_disabled' };
  if (wasIssuedBeforeSecretRotation(claims, app.secretIssuedAt)) {
    return { ok: false, reason: 'secret_rotated' };
  }

  return { app, ok: true };
}

const REJECTION_RESPONSES: Record<
  ExternalAppBearerRejection,
  { error: string; status: 401 | 403 | 500 }
> = {
  // Same answer as an expired bearer, so clients refresh with the new secret.
  secret_rotated: { error: 'Unauthorized', status: 401 },
  app_disabled: { error: 'Forbidden', status: 403 },
  lookup_failed: { error: 'Failed to verify app', status: 500 },
};

export function externalAppBearerRejectionResponse(
  reason: ExternalAppBearerRejection
) {
  const { error, status } = REJECTION_RESPONSES[reason];
  return NextResponse.json({ error }, { status });
}

/** Returns the denial response for a stale bearer, or null when it may proceed. */
export async function rejectStaleExternalAppBearer(
  admin: TypedSupabaseClient,
  claims: Pick<AppCoordinationTokenClaims, 'iat' | 'target_app'>
) {
  const check = await verifyExternalAppBearerIssuer({ admin, claims });
  return check.ok ? null : externalAppBearerRejectionResponse(check.reason);
}

/**
 * The live registration for a bearer's app, or the denial response to return
 * as-is from an access helper.
 */
export async function requireLiveExternalApp(
  admin: TypedSupabaseClient,
  claims: Pick<AppCoordinationTokenClaims, 'iat' | 'target_app'>
) {
  const check = await verifyExternalAppBearerIssuer({ admin, claims });
  return check.ok
    ? { app: check.app, ok: true as const }
    : {
        ok: false as const,
        response: externalAppBearerRejectionResponse(check.reason),
      };
}

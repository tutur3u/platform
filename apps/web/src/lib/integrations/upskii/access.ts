import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getCatalogIntegrationStatus } from '@tuturuuu/utils/integrations-catalog';
import { isQaTestAccount } from '@tuturuuu/utils/qa-test-account';
import { type NextRequest, NextResponse } from 'next/server';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { paceExternalAppExchangeFailure } from '@/lib/external-apps/exchange-rate-limit';
import { UPSKII_APP_ID } from './constants';
import { checkUpskiiQaAccess, type UpskiiQaRefusal } from './qa-access';
import {
  type AccountLinkRoute,
  admitAccountLinkRequest,
  limitVerifiedAccountLinkRequest,
} from './rate-limit';

/**
 * Linking is open to everyone only when the catalog lists Upskii as
 * explicitly available. Any other status, or a missing entry, keeps it to
 * verified staff.
 */
export function isUpskiiLinkingOpen() {
  return getCatalogIntegrationStatus(UPSKII_APP_ID) === 'available';
}

export type UpskiiLinkAccess =
  | { allowed: true; reason: 'open' | 'staff' | 'qa' }
  | { allowed: false; reason: 'early_access' | UpskiiQaRefusal };

/**
 * Whether this user may hold an Upskii link. Staff verification uses the
 * catalog's verified-staff policy (confirmed exact-domain email, no QA
 * identity, the configured Azure directory), and any lookup failure denies.
 * A missing or failed lookup denies even when the catalog is open.
 * A QA test account is admitted only through the `upskii-e2e` exception in
 * `./qa-access`, open catalog or not. Pass `link.upskiiEmail` when deciding a
 * link write, so a QA account can only link a QA fleet Upskii identity.
 */
export async function getUpskiiLinkAccess(
  admin: TypedSupabaseClient,
  userId: string,
  link?: { upskiiEmail: string | null }
): Promise<UpskiiLinkAccess> {
  const open = isUpskiiLinkingOpen();
  let identity: Awaited<ReturnType<typeof getVerifiedAuthUser>>;
  try {
    identity = await getVerifiedAuthUser(admin, userId);
  } catch (error) {
    console.warn('[upskii-link] staff check failed', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    identity = null;
  }
  // Fail closed: an unknown identity could be a QA account, open catalog or not.
  if (!identity) return { allowed: false, reason: 'early_access' };
  if (isQaTestAccount(identity)) {
    const refusal = await checkUpskiiQaAccess(
      admin,
      identity,
      link ? link.upskiiEmail : undefined
    );
    return refusal
      ? { allowed: false, reason: refusal }
      : { allowed: true, reason: 'qa' };
  }
  if (open) return { allowed: true, reason: 'open' };
  return isVerifiedTuturuuuStaffSession(identity)
    ? { allowed: true, reason: 'staff' }
    : { allowed: false, reason: 'early_access' };
}

export async function canUserLinkUpskii(
  admin: TypedSupabaseClient,
  userId: string,
  link?: { upskiiEmail: string | null }
) {
  return (await getUpskiiLinkAccess(admin, userId, link)).allowed;
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');
  return NextResponse.json(body, { ...init, headers });
}

/** `Authorization: Basic base64(appId:appSecret)`, or null when malformed. */
export function readBasicAppCredentials(request: Pick<Request, 'headers'>) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Basic\s+([A-Za-z0-9+/=]{1,512})$/u.exec(header.trim());
  if (!match) return null;
  let decoded: string;
  try {
    decoded = atob(match[1]!);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator <= 0) return null;
  const appId = decoded.slice(0, separator).trim().toLowerCase();
  const appSecret = decoded.slice(separator + 1);
  if (
    !/^[a-z0-9_-]{1,64}$/u.test(appId) ||
    !appSecret ||
    appSecret.length > 200
  )
    return null;
  return { appId, appSecret };
}

function unauthorized() {
  return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Verifies the Upskii server's own app credentials from the Authorization
 * header, with per-IP and per-app limits before the check, failure pacing
 * after a wrong secret, and a per-app limit once verified. Returns the admin
 * client on success, or the response to send.
 */
export async function requireUpskiiAppCredentials(
  request: NextRequest,
  route: AccountLinkRoute
): Promise<
  | { admin: TypedSupabaseClient; ok: true }
  | { ok: false; response: NextResponse }
> {
  const ip = extractIPFromRequest(request.headers);
  const credentials = readBasicAppCredentials(request);
  const admission = await admitAccountLinkRequest({
    appId: credentials?.appId ?? 'none',
    appSecret: credentials?.appSecret,
    ip,
    route,
  });
  if (admission) return { ok: false, response: admission };

  if (!credentials || credentials.appId !== UPSKII_APP_ID) {
    console.warn('[upskii-link] credential refused', {
      reason: credentials ? 'app' : 'header',
      route,
    });
    return { ok: false, response: unauthorized() };
  }

  const verification = await verifyExternalAppSecret(credentials);
  if (!verification.ok) {
    console.warn('[upskii-link] credential refused', {
      reason: 'secret',
      route,
    });
    const paced = await paceExternalAppExchangeFailure(
      { appId: credentials.appId, ip },
      'secret'
    );
    return { ok: false, response: paced ?? unauthorized() };
  }

  const limited = await limitVerifiedAccountLinkRequest({
    appId: credentials.appId,
    route,
  });
  if (limited) return { ok: false, response: limited };

  return {
    admin: (await createAdminClient()) as TypedSupabaseClient,
    ok: true,
  };
}

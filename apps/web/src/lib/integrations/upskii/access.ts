import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { integrationsCatalog } from '@tuturuuu/utils/integrations-catalog';
import { NextResponse } from 'next/server';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { UPSKII_APP_ID } from './constants';

/** Linking follows the catalog: staff-only while Upskii is in early access. */
export function isUpskiiLinkingEarlyAccess() {
  return (
    integrationsCatalog.find((entry) => entry.id === UPSKII_APP_ID)?.status ===
    'early_access'
  );
}

export async function canUserLinkUpskii(
  admin: TypedSupabaseClient,
  userId: string
) {
  if (!isUpskiiLinkingEarlyAccess()) return true;
  return isVerifiedTuturuuuStaffSession(
    await getVerifiedAuthUser(admin, userId)
  );
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');
  return NextResponse.json(body, { ...init, headers });
}

/**
 * Verifies the Upskii server's own app credentials (server-to-server routes).
 * Returns the admin client on success, or the response to send.
 */
export async function requireUpskiiAppCredentials(
  appId: string,
  appSecret: string
): Promise<
  | { admin: TypedSupabaseClient; ok: true }
  | { ok: false; response: NextResponse }
> {
  if (appId !== UPSKII_APP_ID) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const verification = await verifyExternalAppSecret({ appId, appSecret });
  if (!verification.ok) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return {
    admin: (await createAdminClient()) as TypedSupabaseClient,
    ok: true,
  };
}

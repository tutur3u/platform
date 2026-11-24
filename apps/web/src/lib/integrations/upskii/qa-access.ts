import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { createQaStore } from '@/lib/qa-test-users/store';

/**
 * QA accounts never count as staff. The Upskii production E2E suite links
 * them anyway, but only through this narrow exception, modeled on the Meet
 * hosting one (`canVerifiedAccountHostMeeting`): the account's QA run must be
 * live and created for `upskii-e2e`, and it may only link an Upskii QA fleet
 * identity.
 */
export const UPSKII_QA_PURPOSE = 'upskii-e2e';
export const UPSKII_QA_FLEET_EMAIL =
  /^qa-fleet\+[a-z0-9-]{1,40}@tuturuuu\.com$/u;

type QaIdentity = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export type UpskiiQaRefusal = 'qa_run' | 'qa_identity';

/** The immutable marker: confirmed, not banned, `upskii-e2e`, before expiry. */
function markerIsLive(identity: QaIdentity, now: number) {
  const marker = identity.app_metadata;
  if (!identity.email_confirmed_at || marker?.qa_test !== true) return false;
  // Deletion bans the account first, so a banned account is being deleted.
  if (identity.banned_until && Date.parse(identity.banned_until) > now)
    return false;
  if (
    marker.qa_purpose !== UPSKII_QA_PURPOSE ||
    typeof marker.qa_run !== 'string' ||
    typeof marker.qa_expires_at !== 'string'
  )
    return false;
  const expiresAt = Date.parse(marker.qa_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/** The ledger agrees: the account is active, not deleting or deleted, and unexpired. */
async function ledgerIsLive(
  admin: TypedSupabaseClient,
  identity: QaIdentity,
  now: number
) {
  try {
    const rows = await createQaStore(admin).listUsers(
      identity.app_metadata?.qa_run as string,
      false
    );
    const row = rows.find((candidate) => candidate.userId === identity.id);
    return (
      row?.state === 'active' &&
      row.purpose === UPSKII_QA_PURPOSE &&
      Date.parse(row.expiresAt) > now
    );
  } catch {
    return false;
  }
}

/**
 * Decides a QA account's access. `upskiiEmail` is the identity being linked;
 * pass `undefined` for status reads (link status, read tokens), where only the
 * run is checked. Any lookup failure denies.
 */
export async function checkUpskiiQaAccess(
  admin: TypedSupabaseClient,
  identity: QaIdentity,
  upskiiEmail: string | null | undefined,
  now = Date.now()
): Promise<UpskiiQaRefusal | null> {
  if (
    !markerIsLive(identity, now) ||
    !(await ledgerIsLive(admin, identity, now))
  )
    return 'qa_run';
  if (
    upskiiEmail !== undefined &&
    !UPSKII_QA_FLEET_EMAIL.test(upskiiEmail ?? '')
  )
    return 'qa_identity';
  return null;
}

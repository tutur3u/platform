import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MEETING_APP } from '../../../runtime';
import { MeetCallAccessError } from '../../call/lib/call-access';
import type { MeetCallRouteAccess } from '../../call/server/room-service';
import { isMeetUxV2Enabled } from '../../call/server/ux-v2';
import {
  MIRA_ACCOUNT_CONFIRMATION_KEY as KEY,
  MIRA_ACCOUNT_CONFIRMATION_VERSION as VERSION,
} from '../account-confirmation';

export function usesMiraAccountConfirmation() {
  return MEETING_APP === 'meet' && isMeetUxV2Enabled();
}

export async function readMiraAccountConfirmation(access: MeetCallRouteAccess) {
  if ('guest' in access && access.guest) return 'guest';
  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db.auth.admin.getUserById(access.user.id);
    if (error || data.user?.id !== access.user.id) return 'unavailable';
    return data.user.app_metadata[KEY] === VERSION ? 'confirmed' : 'required';
  } catch {
    return 'unavailable';
  }
}

export async function requireMiraAccountConfirmation(access: MeetCallRouteAccess) {
  const status = await readMiraAccountConfirmation(access);
  if (status === 'confirmed') return;
  if (status === 'unavailable')
    throw new MeetCallAccessError(503, 'Mira confirmation is unavailable');
  throw new MeetCallAccessError(
    403,
    'Confirm your account before using Mira',
    'MIRA_ACCOUNT_CONFIRMATION_REQUIRED'
  );
}

export async function confirmMiraAccount(
  access: MeetCallRouteAccess,
  expectedActorId: string
) {
  if (
    ('guest' in access && access.guest) ||
    expectedActorId !== access.user.id
  )
    throw new MeetCallAccessError(403, 'Mira account changed');
  const status = await readMiraAccountConfirmation(access);
  if (status === 'confirmed') return;
  if (status !== 'required')
    throw new MeetCallAccessError(503, 'Mira confirmation is unavailable');
  const db = await createAdminClient({ noCookie: true });
  // A single versioned value makes concurrent confirmations idempotent.
  const { data, error } = await db.auth.admin.updateUserById(access.user.id, {
    app_metadata: { [KEY]: VERSION },
  });
  if (error || data.user?.id !== access.user.id || data.user.app_metadata[KEY] !== VERSION)
    throw new MeetCallAccessError(503, 'Mira confirmation is unavailable');
}

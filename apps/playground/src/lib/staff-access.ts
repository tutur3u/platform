import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

const PLAYGROUND_APP = 'playground';

export type PlaygroundAccess =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Playground is an internal staff tool: it needs a signed-in session whose
 * current Auth identity is a verified staff account and that belongs to the
 * root workspace. Fails closed (403) when either check is not satisfied.
 */
export async function getPlaygroundAccess(): Promise<PlaygroundAccess> {
  const user = await getSatelliteAppSessionUser(PLAYGROUND_APP);
  if (!user?.id) return { ok: false, status: 401 };

  const admin = await createAdminClient({ noCookie: true });
  const authUser = await getVerifiedAuthUser(admin, user.id);
  if (!isVerifiedTuturuuuStaffSession(authUser)) {
    return { ok: false, status: 403 };
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'ANY',
    supabase: admin,
    userId: user.id,
    wsId: ROOT_WORKSPACE_ID,
  });
  return membership.ok
    ? { ok: true, userId: user.id }
    : { ok: false, status: 403 };
}

export function playgroundDeniedResponse(status: 401 | 403) {
  return NextResponse.json(
    { message: status === 401 ? 'Sign in required' : 'Staff access required' },
    { status }
  );
}

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeAiCreditsAdminRequest() {
  const user = await getSatelliteAppSessionUser('infra');

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const membership = await verifyWorkspaceMembershipType({
    wsId: ROOT_WORKSPACE_ID,
    userId: user.id,
    supabase: sbAdmin,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Root workspace admin required' },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, sbAdmin, user };
}

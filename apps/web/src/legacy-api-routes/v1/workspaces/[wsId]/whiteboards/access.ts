import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function requireWhiteboardAccess(
  request: Request,
  rawWsId: string
) {
  const supabase = await createClient(request);
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    wsId,
    sbAdmin: await createAdminClient(),
  };
}

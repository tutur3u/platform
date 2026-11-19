import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};

export async function requireLearnerWorkspace(
  request: NextRequest,
  wsIdParam: string
) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });
  if (!auth.ok) return { error: auth.response };

  const wsId = await normalizeWorkspaceId(wsIdParam, auth.supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
    requiredType: 'ANY',
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500, headers }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json(
        { message: 'Forbidden' },
        { status: 403, headers }
      ),
    };
  }

  return {
    wsId,
    userId: auth.user.id,
    sbAdmin: await createAdminClient(),
    headers,
  };
}

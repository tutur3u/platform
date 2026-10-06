import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
export async function resolveMemoryRequestContext(
  request: NextRequest,
  rawWsId: string
) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase, request);
  } catch {
    console.warn('Failed to normalize AI memory workspace id');
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Invalid workspace identifier' },
        { status: 422 }
      ),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase,
    userId: user.id,
    wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    console.error('Failed to verify AI memory workspace access', {
      userId: user.id,
      wsId,
    });
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const sbAdmin = await createAdminClient();
  return { ok: true as const, sbAdmin, user, wsId };
}

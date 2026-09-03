import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

type CalendarEventManagementAccess =
  | { error: NextResponse }
  | {
      sbAdmin: TypedSupabaseClient;
      userId: string;
      wsId: string;
    };

export async function authorizeCalendarEventManagement(
  request: Request,
  rawWsId: string
): Promise<CalendarEventManagementAccess> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'calendar' },
  });
  if (!auth.ok) return { error: auth.response } as const;

  const { user, supabase } = auth;
  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase);
  } catch (error) {
    console.error('Failed to normalize workspace identifier', error);
    const normalizationFailure =
      error instanceof Error && error.message === 'User not authenticated'
        ? { error: 'User not authenticated', status: 401 }
        : error instanceof Error &&
            error.message === 'Personal workspace not found'
          ? { error: 'Personal workspace not found', status: 404 }
          : { error: 'Failed to resolve workspace', status: 500 };
    return {
      error: NextResponse.json(
        { error: normalizationFailure.error },
        { status: normalizationFailure.status }
      ),
    } as const;
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
    } as const;
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    } as const;
  }

  const { data: hasPermission, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      p_ws_id: wsId,
      p_user_id: user.id,
      p_permission: 'manage_calendar',
    }
  );

  if (permissionError) {
    console.error('Failed to verify calendar event permission', {
      error: permissionError,
    });
    return {
      error: NextResponse.json(
        { error: 'Failed to verify calendar permission' },
        { status: 500 }
      ),
    } as const;
  }

  if (!hasPermission) {
    return {
      error: NextResponse.json(
        { error: 'You do not have permission to manage calendar' },
        { status: 403 }
      ),
    } as const;
  }

  return {
    sbAdmin: await createAdminClient({ noCookie: true }),
    userId: user.id,
    wsId,
  } as const;
}

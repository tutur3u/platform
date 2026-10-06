import { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { PERSONAL_WORKSPACE_SLUG } from '@tuturuuu/utils/constants';
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
  rawWsId: string,
  options?: {
    allowMailPreviewSession?: boolean;
    allowMeetPersonalRead?: boolean;
  }
): Promise<CalendarEventManagementAccess> {
  // Use the signed audience, never editable user metadata, to narrow Meet reads.
  const meetSession =
    options?.allowMeetPersonalRead && request.method === 'GET'
      ? verifyAppSessionRequest(request, { targetApp: 'meet' })
      : null;
  const isMeetRead = meetSession?.ok === true;
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: {
      targetApp: isMeetRead
        ? ['calendar', 'tasks', 'meet']
        : options?.allowMailPreviewSession
          ? ['calendar', 'tasks', 'mail']
          : ['calendar', 'tasks'],
    },
  });
  if (!auth.ok) return { error: auth.response } as const;

  const { user, supabase } = auth;
  if (isMeetRead && meetSession.claims.sub !== user.id)
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  const isPersonalSlug =
    rawWsId.trim().toLowerCase() === PERSONAL_WORKSPACE_SLUG;
  let wsId: string;
  if (isPersonalSlug || isMeetRead) {
    const { data: personalWorkspace, error: personalWorkspaceError } =
      await supabase
        .from('workspaces')
        .select('id, workspace_members!inner(user_id, type)')
        .eq('personal', true)
        .eq('workspace_members.user_id', user.id)
        .eq('workspace_members.type', 'MEMBER')
        .maybeSingle();

    if (personalWorkspaceError) {
      console.error('Failed to resolve personal workspace', {
        error: personalWorkspaceError,
      });
      return {
        error: NextResponse.json(
          { error: 'Failed to resolve workspace' },
          { status: 500 }
        ),
      } as const;
    }
    if (!personalWorkspace) {
      return {
        error: NextResponse.json(
          { error: 'Personal workspace not found' },
          { status: 404 }
        ),
      } as const;
    }
    wsId = personalWorkspace.id;
  } else {
    try {
      wsId = await normalizeWorkspaceId(rawWsId, supabase);
    } catch (error) {
      console.error('Failed to normalize workspace identifier', error);
      return {
        error: NextResponse.json(
          { error: 'Failed to resolve workspace' },
          { status: 500 }
        ),
      } as const;
    }
  }
  if (isMeetRead && !isPersonalSlug) {
    let requestedWsId: string;
    try {
      requestedWsId = await normalizeWorkspaceId(rawWsId, supabase);
    } catch {
      return {
        error: NextResponse.json(
          { error: 'Failed to resolve workspace' },
          { status: 500 }
        ),
      };
    }
    if (requestedWsId !== wsId)
      return {
        error: NextResponse.json(
          { error: 'Personal workspace access required' },
          { status: 403 }
        ),
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

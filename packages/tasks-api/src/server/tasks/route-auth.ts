import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export type TaskRouteAuthContext = {
  appSession?: boolean;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

type LegacyTaskRouteAuth =
  | { auth: TaskRouteAuthContext; response?: never }
  | { auth?: never; response: NextResponse };

export async function resolveSupabaseTaskRouteAuth(
  request: NextRequest
): Promise<LegacyTaskRouteAuth> {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { auth: { appSession: false, supabase, user } };
}

export async function normalizeRouteWorkspaceId({
  appSession,
  supabase,
  userId,
  wsId,
}: {
  appSession: boolean;
  supabase: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  if (!appSession) {
    return normalizeWorkspaceId(wsId, supabase);
  }

  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (wsId.trim().toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !workspace?.id) {
      throw new Error('Personal workspace not found');
    }

    return workspace.id;
  }

  return normalizeWorkspaceId(wsId, supabase);
}

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; projectId: string; taskId: string }> }
) {
  try {
    const { wsId: rawWsId, projectId, taskId } = await params;
    const supabase = await createClient(request);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let wsId: string;
    try {
      wsId = await normalizeWorkspaceId(rawWsId, supabase);
    } catch {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error('Membership lookup failed:', membership.error);
      return NextResponse.json(
        { error: 'Membership lookup failed' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: projectRecord, error: projectError } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Failed to load project:', projectError);
      return NextResponse.json(
        { error: 'Failed to load project' },
        { status: 500 }
      );
    }

    if (!projectRecord || projectRecord.ws_id !== wsId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const unlinkProjectPayload: TaskActorRpcArgs<'unlink_task_project_with_actor'> =
      {
        p_task_id: taskId,
        p_project_id: projectId,
        p_actor_user_id: user.id,
      };
    const { data: deletedLinks, error } = await sbAdmin.rpc(
      'unlink_task_project_with_actor',
      unlinkProjectPayload
    );

    if (error) {
      console.error('Error unlinking task from project:', error);
      return NextResponse.json(
        { error: 'Failed to unlink task from project' },
        { status: 500 }
      );
    }

    if (!deletedLinks || deletedLinks.length === 0) {
      return NextResponse.json(
        { error: 'Task link not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks/[taskId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

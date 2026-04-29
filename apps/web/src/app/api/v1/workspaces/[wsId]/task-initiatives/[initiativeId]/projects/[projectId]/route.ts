import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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
  }: {
    params: Promise<{ wsId: string; initiativeId: string; projectId: string }>;
  }
) {
  try {
    const { wsId: rawWsId, initiativeId, projectId } = await params;
    const supabase = await createClient(request);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: initiative } = await sbAdmin
      .from('task_initiatives')
      .select('id')
      .eq('id', initiativeId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (!initiative) {
      return NextResponse.json(
        { error: 'Initiative not found' },
        { status: 404 }
      );
    }

    const { data: project } = await sbAdmin
      .from('task_projects')
      .select('id')
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: deletedLink, error } = await sbAdmin
      .from('task_project_initiatives')
      .delete()
      .eq('initiative_id', initiativeId)
      .eq('project_id', projectId)
      .select('initiative_id, project_id')
      .maybeSingle();

    if (error) {
      console.error('Error unlinking project from initiative:', error);
      return NextResponse.json(
        { error: 'Failed to unlink project from initiative' },
        { status: 500 }
      );
    }

    if (!deletedLink) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]/projects/[projectId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

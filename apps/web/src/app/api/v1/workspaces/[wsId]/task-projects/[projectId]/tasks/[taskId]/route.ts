import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
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
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: projectRecord } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .single();

    if (!projectRecord || projectRecord.ws_id !== wsId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: deletedLinks, error } = await sbAdmin
      .from('task_project_tasks')
      .delete()
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .select('project_id,task_id');

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

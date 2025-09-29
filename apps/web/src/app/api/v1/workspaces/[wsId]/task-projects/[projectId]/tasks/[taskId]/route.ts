import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; projectId: string; taskId: string }> }
) {
  try {
    const { wsId, projectId, taskId } = await params;
    const supabase = await createClient();

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

    const { data: projectRecord } = await supabase
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .single();

    if (!projectRecord || projectRecord.ws_id !== wsId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('task_project_tasks')
      .delete()
      .eq('project_id', projectId)
      .eq('task_id', taskId);

    if (error) {
      console.error('Error unlinking task from project:', error);
      return NextResponse.json(
        { error: 'Failed to unlink task from project' },
        { status: 500 }
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

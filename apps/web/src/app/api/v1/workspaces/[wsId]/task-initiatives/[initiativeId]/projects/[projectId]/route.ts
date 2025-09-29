import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; initiativeId: string; projectId: string }> }
) {
  try {
    const { wsId, initiativeId, projectId } = await params;
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

    const { error } = await supabase
      .from('task_project_initiatives')
      .delete()
      .eq('initiative_id', initiativeId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error unlinking project from initiative:', error);
      return NextResponse.json(
        { error: 'Failed to unlink project from initiative' },
        { status: 500 }
      );
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

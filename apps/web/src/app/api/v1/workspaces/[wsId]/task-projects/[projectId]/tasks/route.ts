import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const linkTaskSchema = z.object({
  taskId: z.string().uuid('Task id must be a valid UUID'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
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

    const body = await request.json();
    const { taskId } = linkTaskSchema.parse(body);

    // Ensure the project exists in the same workspace
    const { data: projectRecord } = await supabase
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .single();

    if (!projectRecord || projectRecord.ws_id !== wsId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch the task and verify workspace ownership
    const { data: taskRecord } = await supabase
      .from('tasks')
      .select(
        `
          id,
          name,
          completed,
          task_lists(
            workspace_boards(ws_id),
            name
          )
        `
      )
      .eq('id', taskId)
      .single();

    if (
      !taskRecord ||
      taskRecord.task_lists?.workspace_boards?.ws_id !== wsId
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { error: linkError } = await supabase
      .from('task_project_tasks')
      .insert({
        project_id: projectId,
        task_id: taskId,
      });

    if (linkError) {
      if ('code' in linkError && linkError.code === '23505') {
        return NextResponse.json(
          { error: 'Task already linked to this project' },
          { status: 409 }
        );
      }

      console.error('Error linking task to project:', linkError);
      return NextResponse.json(
        { error: 'Failed to link task to project' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      linkedTask: {
        id: taskRecord.id,
        name: taskRecord.name,
        completed: taskRecord.completed,
        listName: taskRecord.task_lists?.name ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message },
        { 400 }
      );
   console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

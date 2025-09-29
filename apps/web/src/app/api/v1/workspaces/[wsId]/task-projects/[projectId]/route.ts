import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { name, description } = updateProjectSchema.parse(body);

    // Update project
    const { data: updatedProject, error: updateError } = await supabase
      .from('task_projects')
      .update({ name, description: description || null })
      .eq('id', projectId)
      .eq('ws_id', wsId)
      .select(`
        *,
        task_project_tasks(
          task:tasks(
            id,
            name,
            completed,
            task_lists(
              name
            )
          )
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating project:', updateError);
      return NextResponse.json(
        { error: 'Failed to update project' },
        { status: 500 }
      );
    }

    if (!updatedProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: updatedProject.id,
      name: updatedProject.name,
      description: updatedProject.description,
      created_at: updatedProject.created_at,
      creator_id: updatedProject.creator_id,
      creator: null,
      tasksCount: updatedProject.task_project_tasks?.length ?? 0,
      linkedTasks:
        updatedProject.task_project_tasks?.flatMap((link) =>
          link.task
            ? [
                {
                  id: link.task.id,
                  name: link.task.name,
                  completed: link.task.completed,
                  listName: link.task.task_lists?.name ?? null,
                },
              ]
            : []
        ) ?? [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in PUT /api/v1/workspaces/[wsId]/task-projects/[projectId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string; projectId: string }> }
) {
  try {
    const { wsId, projectId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete project
    const { error: deleteError } = await supabase
      .from('task_projects')
      .delete()
      .eq('id', projectId)
      .eq('ws_id', wsId);

    if (deleteError) {
      console.error('Error deleting project:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete project' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-projects/[projectId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

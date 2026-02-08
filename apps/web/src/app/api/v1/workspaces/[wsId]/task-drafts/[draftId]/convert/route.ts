import { createClient } from '@tuturuuu/supabase/next/server';
import { createTask } from '@tuturuuu/utils/task-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Permissive UUID pattern — the DB uuid column enforces strict format
const uuidString = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid UUID format'
  );

const convertSchema = z.object({
  listId: uuidString,
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; draftId: string }> }
) {
  try {
    const { wsId, draftId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
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

    // Fetch the draft
    const { data: draft, error: draftError } = await supabase
      .from('task_drafts')
      .select('*')
      .eq('id', draftId)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .single();

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const body = await request.json();
    const { listId } = convertSchema.parse(body);

    // Verify list exists and belongs to a board in this workspace
    const { data: list, error: listError } = await supabase
      .from('task_lists')
      .select('id, board_id')
      .eq('id', listId)
      .single();

    if (listError || !list) {
      return NextResponse.json(
        { error: 'Task list not found' },
        { status: 404 }
      );
    }

    const { data: board, error: boardError } = await supabase
      .from('workspace_boards')
      .select('id, ws_id')
      .eq('id', list.board_id)
      .eq('ws_id', wsId)
      .single();

    if (boardError || !board) {
      return NextResponse.json(
        { error: 'Invalid task list for this workspace' },
        { status: 400 }
      );
    }

    // Create the task from draft data
    const validPriorities = ['critical', 'high', 'normal', 'low'] as const;
    type ValidPriority = (typeof validPriorities)[number];
    const priority = validPriorities.includes(draft.priority as ValidPriority)
      ? (draft.priority as ValidPriority)
      : undefined;

    const newTask = await createTask(supabase, listId, {
      name: draft.name,
      description: draft.description || undefined,
      priority,
      start_date: draft.start_date || undefined,
      end_date: draft.end_date || undefined,
      estimation_points: draft.estimation_points ?? undefined,
    });

    // Add assignees one by one to ensure triggers fire
    const assigneeIds = (draft.assignee_ids as string[]) || [];
    for (const userId of assigneeIds) {
      const { error } = await supabase.from('task_assignees').insert({
        task_id: newTask.id,
        user_id: userId,
      });
      if (error) {
        console.error(`Failed to add assignee ${userId}:`, error);
      }
    }

    // Add labels one by one to ensure triggers fire
    const labelIds = (draft.label_ids as string[]) || [];
    for (const labelId of labelIds) {
      const { error } = await supabase.from('task_labels').insert({
        task_id: newTask.id,
        label_id: labelId,
      });
      if (error) {
        console.error(`Failed to add label ${labelId}:`, error);
      }
    }

    // Add projects one by one to ensure triggers fire
    const projectIds = ((draft as any).project_ids as string[]) || [];
    for (const projectId of projectIds) {
      const { error } = await supabase.from('task_project_tasks').insert({
        task_id: newTask.id,
        project_id: projectId,
      });
      if (error) {
        console.error(`Failed to add project ${projectId}:`, error);
      }
    }

    // Delete the draft
    await supabase.from('task_drafts').delete().eq('id', draftId);

    return NextResponse.json({
      success: true,
      message: 'Draft converted to task successfully',
      data: { taskId: newTask.id },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /task-drafts/[draftId]/convert:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

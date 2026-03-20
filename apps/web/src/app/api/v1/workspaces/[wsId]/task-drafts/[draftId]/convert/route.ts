import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { createTask } from '@tuturuuu/utils/task-helper';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
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
    const { wsId: rawWsId, draftId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error(
        'Failed to verify workspace membership for draft conversion:',
        membershipError
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch the draft
    const { data: draft, error: draftError } = await sbAdmin
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

    const newTask = await createTask(wsId, listId, {
      name: draft.name,
      description: draft.description || undefined,
      priority,
      start_date: draft.start_date || undefined,
      end_date: draft.end_date || undefined,
      estimation_points: draft.estimation_points ?? undefined,
      assignee_ids: Array.isArray(draft.assignee_ids)
        ? (draft.assignee_ids as string[])
        : [],
      label_ids: Array.isArray(draft.label_ids)
        ? (draft.label_ids as string[])
        : [],
      project_ids: Array.isArray(
        (draft as { project_ids?: unknown }).project_ids
      )
        ? (((draft as { project_ids?: unknown }).project_ids as string[]) ?? [])
        : [],
    });

    // Delete the draft
    await sbAdmin
      .from('task_drafts')
      .delete()
      .eq('id', draftId)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id);

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

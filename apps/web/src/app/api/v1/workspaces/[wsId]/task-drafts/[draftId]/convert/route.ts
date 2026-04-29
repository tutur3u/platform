import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, TaskDraft } from '@tuturuuu/types';
import { createTask } from '@tuturuuu/utils/task-helper';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
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

type DraftRelationField = Pick<
  TaskDraft,
  'assignee_ids' | 'label_ids' | 'project_ids'
>[keyof Pick<TaskDraft, 'assignee_ids' | 'label_ids' | 'project_ids'>];
type TaskDraftInsert = Database['public']['Tables']['task_drafts']['Insert'];

function normalizeDraftRelationIds(
  value: DraftRelationField,
  fieldName: 'assignee_ids' | 'label_ids' | 'project_ids'
) {
  if (value == null) {
    return { ids: [] as string[] };
  }

  if (!Array.isArray(value)) {
    return { error: `Invalid ${fieldName} on draft` };
  }

  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return { error: `Invalid ${fieldName} on draft` };
    }

    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      ids.push(trimmed);
    }
  }

  return { ids };
}

async function restoreDraft(sbAdmin: TypedSupabaseClient, draft: TaskDraft) {
  const draftToRestore: TaskDraftInsert = {
    ...draft,
  };
  const { error } = await sbAdmin.from('task_drafts').insert(draftToRestore);

  if (error) {
    console.error(
      'Failed to restore task draft after conversion error:',
      error
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; draftId: string }> }
) {
  try {
    const { wsId: rawWsId, draftId } = await params;
    const parsedDraftId = z.guid().safeParse(draftId);
    if (!parsedDraftId.success) {
      return NextResponse.json({ error: 'Invalid draft ID' }, { status: 400 });
    }

    const supabase = await createClient(request);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);
    const sbAdmin = await createAdminClient();

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      console.error(
        'Failed to verify workspace membership for draft conversion:',
        membership.error
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const { data: claimedDraft, error: claimError } = await sbAdmin
      .from('task_drafts')
      .delete()
      .eq('id', parsedDraftId.data)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .select('*')
      .maybeSingle();

    if (claimError) {
      console.error('Failed to claim draft for conversion:', claimError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    if (!claimedDraft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const draft = claimedDraft as TaskDraft;

    // Create the task from draft data
    const validPriorities = ['critical', 'high', 'normal', 'low'] as const;
    type ValidPriority = (typeof validPriorities)[number];
    const priority = validPriorities.includes(draft.priority as ValidPriority)
      ? (draft.priority as ValidPriority)
      : undefined;

    const normalizedAssigneeIds = normalizeDraftRelationIds(
      draft.assignee_ids,
      'assignee_ids'
    );
    const normalizedLabelIds = normalizeDraftRelationIds(
      draft.label_ids,
      'label_ids'
    );
    const normalizedProjectIds = normalizeDraftRelationIds(
      draft.project_ids,
      'project_ids'
    );

    const invalidDraftRelationError =
      normalizedAssigneeIds.error ??
      normalizedLabelIds.error ??
      normalizedProjectIds.error;

    if (invalidDraftRelationError) {
      await restoreDraft(sbAdmin, draft);
      return NextResponse.json(
        { error: invalidDraftRelationError },
        { status: 400 }
      );
    }

    try {
      const newTask = await createTask(wsId, listId, {
        name: draft.name,
        description: draft.description || undefined,
        priority,
        start_date: draft.start_date || undefined,
        end_date: draft.end_date || undefined,
        estimation_points: draft.estimation_points ?? undefined,
        assignee_ids: normalizedAssigneeIds.ids,
        label_ids: normalizedLabelIds.ids,
        project_ids: normalizedProjectIds.ids,
      });

      return NextResponse.json({
        success: true,
        message: 'Draft converted to task successfully',
        data: { taskId: newTask.id },
      });
    } catch (createError) {
      await restoreDraft(sbAdmin, draft);
      throw createError;
    }
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

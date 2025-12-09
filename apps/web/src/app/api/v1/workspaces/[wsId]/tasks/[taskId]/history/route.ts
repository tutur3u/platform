import { createClient } from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  limit: z
    .string()
    .nullish()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
  offset: z
    .string()
    .nullish()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
  change_type: z
    .enum([
      'task_created',
      'field_updated',
      'assignee_added',
      'assignee_removed',
      'label_added',
      'label_removed',
      'project_linked',
      'project_unlinked',
    ])
    .nullish(),
  field_name: z
    .enum([
      'name',
      'description',
      'priority',
      'end_date',
      'start_date',
      'estimation_points',
      'list_id',
      'completed',
    ])
    .nullish(),
});

/**
 * GET /api/v1/workspaces/[wsId]/tasks/[taskId]/history
 * Fetches task change history with pagination and filtering
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wsId: rawWsId, taskId } = await params;
    const wsId = resolveWorkspaceId(rawWsId);

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = querySchema.safeParse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      change_type: searchParams.get('change_type'),
      field_name: searchParams.get('field_name'),
    });

    if (!queryParams.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: queryParams.error.issues,
        },
        { status: 400 }
      );
    }

    const { limit, offset, change_type, field_name } = queryParams.data;

    // Call the RPC function for efficient data retrieval
    const { data: history, error: historyError } = await supabase.rpc(
      'get_task_history',
      {
        p_ws_id: wsId,
        p_task_id: taskId,
        p_limit: limit,
        p_offset: offset,
        p_change_type: change_type ?? undefined,
        p_field_name: field_name ?? undefined,
      }
    );

    if (historyError) {
      console.error('Error fetching task history:', historyError);

      // Handle specific error messages from the RPC
      if (historyError.message === 'Task not found') {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      if (historyError.message === 'Task does not belong to this workspace') {
        return NextResponse.json(
          { error: 'Task does not belong to this workspace' },
          { status: 403 }
        );
      }
      if (historyError.message === 'Access denied to workspace') {
        return NextResponse.json(
          { error: 'Access denied to workspace' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch task history' },
        { status: 500 }
      );
    }

    // Get total count and task name from first row (or defaults if empty)
    const totalCount = history?.[0]?.total_count ?? 0;
    const taskName = history?.[0]?.task_name ?? 'Unknown Task';

    // Format the response
    const formattedHistory = (history || []).map((entry) => ({
      id: entry.id,
      task_id: entry.task_id,
      changed_by: entry.changed_by ?? undefined,
      changed_at: entry.changed_at,
      change_type: entry.change_type ?? undefined,
      field_name: entry.field_name ?? undefined,
      old_value: entry.old_value ?? undefined,
      new_value: entry.new_value ?? undefined,
      metadata: entry.metadata,
      user: entry.user_id
        ? {
            id: entry.user_id,
            name: entry.user_display_name || 'Unknown',
            avatar_url: entry.user_avatar_url,
          }
        : null,
    }));

    return NextResponse.json({
      history: formattedHistory,
      count: Number(totalCount),
      limit,
      offset,
      task: {
        id: taskId,
        name: taskName,
      },
    });
  } catch (error) {
    console.error('Error in task history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

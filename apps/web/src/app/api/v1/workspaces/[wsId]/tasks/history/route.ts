import { createClient } from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  page: z
    .string()
    .nullish()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .nullish()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
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
  board_id: z.string().uuid().nullish(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  search: z.string().nullish(),
});

/**
 * GET /api/v1/workspaces/[wsId]/tasks/history
 * Fetches workspace-wide task change history with pagination and filtering
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
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

    const { wsId: rawWsId } = await params;
    const wsId = resolveWorkspaceId(rawWsId);

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = querySchema.safeParse({
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      change_type: searchParams.get('change_type'),
      field_name: searchParams.get('field_name'),
      board_id: searchParams.get('board_id'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      search: searchParams.get('search'),
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

    const {
      page,
      pageSize,
      change_type,
      field_name,
      board_id,
      from,
      to,
      search,
    } = queryParams.data;

    // Call the RPC function for efficient data retrieval
    const { data: history, error: historyError } = await supabase.rpc(
      'get_workspace_task_history',
      {
        p_ws_id: wsId,
        p_page: page,
        p_page_size: pageSize,
        p_change_type: change_type ?? undefined,
        p_field_name: field_name ?? undefined,
        p_board_id: board_id ?? undefined,
        p_search: search ?? undefined,
        p_from: from ?? undefined,
        p_to: to ?? undefined,
      }
    );

    if (historyError) {
      console.error('Error fetching task history:', historyError);

      // Handle specific error messages from the RPC
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

    // Get total count from first row (or 0 if empty)
    const totalCount = history?.[0]?.total_count ?? 0;

    // Format the response
    const formattedHistory = (history || []).map((entry) => ({
      id: entry.id,
      task_id: entry.task_id,
      task_name: entry.task_name || 'Unknown Task',
      board_id: entry.board_id ?? undefined,
      board_name: entry.board_name ?? undefined,
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
      data: formattedHistory,
      count: Number(totalCount),
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Error in workspace task history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

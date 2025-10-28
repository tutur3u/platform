import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
  change_type: z
    .enum([
      'field_updated',
      'assignee_added',
      'assignee_removed',
      'label_added',
      'label_removed',
      'project_linked',
      'project_unlinked',
    ])
    .optional(),
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
    .optional(),
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

    const { wsId, taskId } = await params;

    // Validate workspace access
    const { data: workspaceMember, error: memberError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !workspaceMember) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Validate task exists and belongs to workspace
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
        list_id,
        task_lists!inner(
          id,
          name,
          board_id,
          workspace_boards!inner(
            id,
            name,
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if task belongs to the requested workspace
    const taskWsId = (task.task_lists as any)?.workspace_boards?.ws_id;
    if (taskWsId !== wsId) {
      return NextResponse.json(
        { error: 'Task does not belong to this workspace' },
        { status: 403 }
      );
    }

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

    // Build query for task history
    let query = supabase
      .from('task_history')
      .select(
        `
        id,
        task_id,
        changed_by,
        changed_at,
        change_type,
        field_name,
        old_value,
        new_value,
        metadata,
        users:changed_by(
          id,
          display_name,
          full_name,
          email,
          avatar_url
        )
      `,
        { count: 'exact' }
      )
      .eq('task_id', taskId)
      .is('deleted_at', null)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false }); // Tiebreaker for same timestamp

    // Apply filters
    if (change_type) {
      query = query.eq('change_type', change_type);
    }

    if (field_name) {
      query = query.eq('field_name', field_name);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: history, error: historyError, count } = await query;

    if (historyError) {
      console.error('Error fetching task history:', historyError);
      return NextResponse.json(
        { error: 'Failed to fetch task history' },
        { status: 500 }
      );
    }

    // Format the response with user details
    const formattedHistory = (history || []).map((entry) => ({
      id: entry.id,
      task_id: entry.task_id,
      changed_by: entry.changed_by,
      changed_at: entry.changed_at,
      change_type: entry.change_type,
      field_name: entry.field_name,
      old_value: entry.old_value,
      new_value: entry.new_value,
      metadata: entry.metadata,
      user: entry.users
        ? {
            id: (entry.users as any).id,
            name:
              (entry.users as any).display_name ||
              (entry.users as any).full_name ||
              (entry.users as any).email,
            avatar_url: (entry.users as any).avatar_url,
          }
        : null,
    }));

    return NextResponse.json({
      history: formattedHistory,
      count: count || 0,
      limit,
      offset,
      task: {
        id: task.id,
        name: task.name,
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

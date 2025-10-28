import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  wsId: z.string().uuid().nullable().optional().transform(val => val || undefined),
  scope: z.enum(['user', 'workspace', 'system']).nullable().optional().transform(val => val || undefined),
  limit: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
  offset: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
  unreadOnly: z
    .string()
    .nullable()
    .optional()
    .transform((val) => val === 'true'),
  type: z
    .enum([
      'task_assigned',
      'task_updated',
      'task_mention',
      'workspace_invite',
      'system_announcement',
      'account_update',
      'security_alert',
    ])
    .nullable()
    .optional()
    .transform(val => val || undefined),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional().transform(val => val || undefined),
});

/**
 * GET /api/v1/notifications
 * Fetches notifications for the authenticated user (workspace, user-level, or system notifications)
 */
export async function GET(req: Request) {
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

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = querySchema.safeParse({
      wsId: searchParams.get('wsId'),
      scope: searchParams.get('scope'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      unreadOnly: searchParams.get('unreadOnly'),
      type: searchParams.get('type'),
      priority: searchParams.get('priority'),
    });

    if (!queryParams.success) {
      console.error('Query validation error:', queryParams.error);
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: queryParams.error.issues,
          received: {
            wsId: searchParams.get('wsId'),
            scope: searchParams.get('scope'),
            limit: searchParams.get('limit'),
            offset: searchParams.get('offset'),
            unreadOnly: searchParams.get('unreadOnly'),
            type: searchParams.get('type'),
            priority: searchParams.get('priority'),
          },
        },
        { status: 400 }
      );
    }

    const { wsId, scope, limit, offset, unreadOnly, type, priority } =
      queryParams.data;

    // Get all workspaces the user has access to
    const { data: userWorkspaces } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('user_id', user.id);

    const accessibleWorkspaceIds = userWorkspaces?.map((m) => m.ws_id) || [];

    // If wsId provided, verify user has access to that specific workspace
    if (wsId && !accessibleWorkspaceIds.includes(wsId)) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Build query - DO NOT add order yet, apply it after all filters
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Filter by workspace if provided, otherwise show all accessible workspaces
    // IMPORTANT: Always include user-scoped notifications (ws_id IS NULL)
    if (wsId) {
      // Include both workspace-specific AND user-scoped notifications
      query = query.or(`ws_id.eq.${wsId},and(scope.eq.user,ws_id.is.null)`);
    } else if (accessibleWorkspaceIds.length > 0) {
      // User wants all notifications across their workspaces
      // Include workspace notifications AND user-scoped notifications
      const wsIdFilter = accessibleWorkspaceIds.map(id => `ws_id.eq.${id}`).join(',');
      query = query.or(`${wsIdFilter},and(scope.eq.user,ws_id.is.null)`);
    } else {
      // No workspaces - only show user-scoped and system notifications
      query = query.or('scope.eq.user,scope.eq.system');
    }

    // Filter by scope if provided
    if (scope) {
      query = query.eq('scope', scope);
    }

    // Filter unread only
    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    // Filter by type
    if (type) {
      query = query.eq('type', type);
    }

    // Filter by priority
    if (priority) {
      query = query.eq('priority', priority);
    }

    // CRITICAL: Apply order AFTER all filters to ensure consistent ordering
    // Sort by created_at DESC, then by id DESC as tiebreaker for same timestamps
    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    // Apply pagination last
    query = query.range(offset, offset + limit - 1);

    const { data: notifications, error, count } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      notifications: notifications || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in notifications API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const bulkUpdateSchema = z.object({
  wsId: z.string().uuid().nullable().optional().transform(val => val || undefined),
  scope: z.enum(['user', 'workspace', 'system']).nullable().optional().transform(val => val || undefined),
  action: z.enum(['mark_all_read', 'mark_all_unread']),
});

/**
 * PATCH /api/v1/notifications
 * Bulk update notifications (mark all as read/unread) for workspace or user-level notifications
 */
export async function PATCH(req: Request) {
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

    // Parse and validate body
    const body = await req.json();
    const validatedData = bulkUpdateSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validatedData.error },
        { status: 400 }
      );
    }

    const { wsId, scope, action } = validatedData.data;

    // Get all workspaces the user has access to
    const { data: userWorkspaces } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('user_id', user.id);

    const accessibleWorkspaceIds = userWorkspaces?.map((m) => m.ws_id) || [];

    // If wsId provided, verify user has access to that specific workspace
    if (wsId && !accessibleWorkspaceIds.includes(wsId)) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Perform bulk update
    const update =
      action === 'mark_all_read'
        ? { read_at: new Date().toISOString() }
        : { read_at: null };

    // Build the filter condition based on wsId (must match GET logic)
    let filterCondition = '';

    if (wsId) {
      // Include both workspace-specific AND user-scoped notifications
      // This matches the GET endpoint logic
      filterCondition = `ws_id.eq.${wsId},and(scope.eq.user,ws_id.is.null)`;
    } else if (accessibleWorkspaceIds.length > 0) {
      // User wants to update all notifications across their workspaces
      // Include workspace notifications AND user-scoped notifications
      const wsIdFilter = accessibleWorkspaceIds.map(id => `ws_id.eq.${id}`).join(',');
      filterCondition = `${wsIdFilter},and(scope.eq.user,ws_id.is.null)`;
    } else {
      // No workspaces - only show user-scoped and system notifications
      filterCondition = 'scope.eq.user,scope.eq.system';
    }

    let query = supabase
      .from('notifications')
      .update(update)
      .eq('user_id', user.id);

    // Apply workspace/scope filter
    if (filterCondition) {
      query = query.or(filterCondition);
    }

    // Filter by scope if provided (additional filter)
    if (scope) {
      query = query.eq('scope', scope);
    }

    // Only update notifications with the opposite read status
    query = query.is('read_at', action === 'mark_all_read' ? null : 'not.null');

    const { error } = await query;

    if (error) {
      console.error('Error updating notifications:', error);
      return NextResponse.json(
        { error: 'Failed to update notifications' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in bulk notifications update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  wsId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((val) => val || undefined),
  scope: z
    .enum(['user', 'workspace', 'system'])
    .nullable()
    .optional()
    .transform((val) => val || undefined),
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
    .transform((val) => val || undefined),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .nullable()
    .optional()
    .transform((val) => val || undefined),
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

    // Build query - DO NOT add order yet, apply it after all filters
    // Include workspace name and actor info via join
    // NOTE: We rely entirely on RLS policies for access control
    // RLS handles: user_id matches, email matches, workspace membership, etc.
    let query = supabase
      .from('notifications')
      .select(
        '*, workspace:workspaces(name), actor:users!notifications_created_by_fkey(id, display_name, avatar_url)',
        { count: 'exact' }
      );

    // Filter by workspace if specifically requested
    if (wsId) {
      query = query.eq('ws_id', wsId);
    }
    // Otherwise: fetch ALL notifications for this user (RLS handles access control)

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

    // Transform notifications to include workspace_name and actor info
    const transformedNotifications = (notifications || []).map((n: any) => ({
      ...n,
      data: {
        ...n.data,
        workspace_name: n.workspace?.name || n.data?.workspace_name,
      },
      actor: n.actor
        ? {
            id: n.actor.id,
            display_name: n.actor.display_name,
            avatar_url: n.actor.avatar_url,
          }
        : null,
      workspace: undefined, // Remove the joined workspace object
    }));

    return NextResponse.json({
      notifications: transformedNotifications,
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
  wsId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((val) => val || undefined),
  scope: z
    .enum(['user', 'workspace', 'system'])
    .nullable()
    .optional()
    .transform((val) => val || undefined),
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

    // Perform bulk update
    const update =
      action === 'mark_all_read'
        ? { read_at: new Date().toISOString() }
        : { read_at: null };

    // Build query - RLS handles access control completely
    // This allows updating notifications matched by user_id OR email
    let query = supabase.from('notifications').update(update);

    // Filter by workspace if specifically requested
    if (wsId) {
      query = query.eq('ws_id', wsId);
    }
    // Otherwise: update ALL notifications for this user (RLS handles access control)

    // Filter by scope if provided (additional filter)
    if (scope) {
      query = query.eq('scope', scope);
    }

    // Only update notifications with the opposite read status
    if (action === 'mark_all_read') {
      query = query.is('read_at', null);
    } else {
      query = query.not('read_at', 'is', null);
    }

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

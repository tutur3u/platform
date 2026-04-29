import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
} from './access';

const querySchema = z.object({
  wsId: z
    .string()
    .guid()
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
  readOnly: z
    .string()
    .nullable()
    .optional()
    .transform((val) => val === 'true'),
  type: z
    .enum([
      'task_assigned',
      'task_updated',
      'task_completed',
      'task_reopened',
      'task_priority_changed',
      'task_due_date_changed',
      'task_start_date_changed',
      'task_estimation_changed',
      'task_moved',
      'task_mention',
      'task_title_changed',
      'task_description_changed',
      'task_label_added',
      'task_label_removed',
      'task_project_linked',
      'task_project_unlinked',
      'task_assignee_removed',
      'deadline_reminder',
      'workspace_invite',
      'system_announcement',
      'account_update',
      'security_alert',
      'report_approved',
      'report_rejected',
      'post_approved',
      'post_rejected',
      'time_tracking_request_submitted',
      'time_tracking_request_resubmitted',
      'time_tracking_request_approved',
      'time_tracking_request_rejected',
      'time_tracking_request_needs_info',
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
    const supabase = await createClient(req);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessContext = await getNotificationAccessContext(supabase, user);

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = querySchema.safeParse({
      wsId: searchParams.get('wsId'),
      scope: searchParams.get('scope'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      unreadOnly: searchParams.get('unreadOnly'),
      readOnly: searchParams.get('readOnly'),
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

    const { wsId, scope, limit, offset, unreadOnly, readOnly, type, priority } =
      queryParams.data;

    // Build query - DO NOT add order yet, apply it after all filters.
    // notifications uses the proxy-only admin path, so ownership must be
    // enforced explicitly here instead of relying on RLS.
    let query = sbAdmin
      .from('notifications')
      .select(
        '*, workspace:workspaces(name), actor:users!notifications_created_by_fkey(id, display_name, avatar_url)',
        { count: 'exact' }
      )
      .or(buildNotificationAccessFilter(accessContext));

    // Filter by workspace if specifically requested
    if (wsId) {
      query = query.eq('ws_id', wsId);
    }
    // Otherwise: fetch ALL notifications for this user (RLS handles access control)

    // Filter by scope if provided
    if (scope) {
      query = query.eq('scope', scope);
    }

    // Filter by read status
    if (unreadOnly) {
      query = query.is('read_at', null);
    } else if (readOnly) {
      query = query.not('read_at', 'is', null) as typeof query;
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
    .guid()
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
    const supabase = await createClient(req);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessContext = await getNotificationAccessContext(supabase, user);

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

    // notifications uses the proxy-only admin path, so ownership must be
    // enforced explicitly instead of relying on RLS.
    let query = sbAdmin
      .from('notifications')
      .update(update)
      .or(buildNotificationAccessFilter(accessContext));

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
      query = query.not('read_at', 'is', null) as typeof query;
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

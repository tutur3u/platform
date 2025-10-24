import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  wsId: z.string().uuid(),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  offset: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 0)),
  unreadOnly: z.string().optional().transform((val) => val === 'true'),
  type: z.enum(['task_assigned', 'task_updated', 'task_mention', 'workspace_invite']).optional(),
});

/**
 * GET /api/v1/notifications
 * Fetches notifications for the authenticated user in a workspace
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
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      unreadOnly: searchParams.get('unreadOnly'),
      type: searchParams.get('type'),
    });

    if (!queryParams.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryParams.error },
        { status: 400 }
      );
    }

    const { wsId, limit, offset, unreadOnly, type } = queryParams.data;

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    if (type) {
      query = query.eq('type', type);
    }

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
  wsId: z.string().uuid(),
  action: z.enum(['mark_all_read', 'mark_all_unread']),
});

/**
 * PATCH /api/v1/notifications
 * Bulk update notifications (mark all as read/unread)
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

    const { wsId, action } = validatedData.data;

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Perform bulk update
    const update = action === 'mark_all_read'
      ? { read_at: new Date().toISOString() }
      : { read_at: null };

    const { error } = await supabase
      .from('notifications')
      .update(update)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .is('read_at', action === 'mark_all_read' ? null : 'not.null');

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

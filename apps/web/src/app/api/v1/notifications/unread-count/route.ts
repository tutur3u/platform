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
});

/**
 * GET /api/v1/notifications/unread-count
 * Gets the unread notification count for the authenticated user.
 * If wsId is provided, scopes to that workspace. Otherwise returns total unread count.
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
    });

    if (!queryParams.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryParams.error },
        { status: 400 }
      );
    }

    const { wsId } = queryParams.data;

    // If workspace is specified, verify membership
    if (wsId) {
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
    }

    // Get unread count - RLS handles access control
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null);

    if (wsId) {
      query = query.eq('ws_id', wsId);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error fetching unread count:', error);
      return NextResponse.json(
        { error: 'Failed to fetch unread count' },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error('Error in unread count API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(5),
});

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      wsId: string;
      id: string;
    }>;
  }
) {
  const { wsId, id: requestId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify user has access to this workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('id:user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the request belongs to this workspace
  const { data: request, error: requestError } = await supabase
    .from('time_tracking_requests')
    .select('id')
    .eq('id', requestId)
    .eq('workspace_id', wsId)
    .single();

  if (requestError || !request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  // Parse pagination parameters
  const url = new URL(req.url);
  const parsed = paginationSchema.safeParse({
    page: url.searchParams.get('page'),
    limit: url.searchParams.get('limit'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid pagination parameters' },
      { status: 400 }
    );
  }
  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  // Get total count
  const { count: totalCount, error: countError } = await supabase
    .from('time_tracking_request_activity_with_users')
    .select('*', { count: 'exact', head: true })
    .eq('request_id', requestId);

  if (countError) {
    console.error('Error counting activity:', countError);
    return NextResponse.json(
      { error: 'Failed to count activity' },
      { status: 500 }
    );
  }

  // Fetch activity log with user details using the view
  const { data: activities, error } = await supabase
    .from('time_tracking_request_activity_with_users')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching activity log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity log' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: activities,
    total: totalCount || 0,
    page,
    limit,
  });
}

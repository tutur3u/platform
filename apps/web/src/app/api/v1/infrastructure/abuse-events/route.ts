import { createClient } from '@tuturuuu/supabase/next/server';
import type { AbuseEventType } from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  // Parse query parameters
  const url = new URL(req.url);
  const ipFilter = url.searchParams.get('ip');
  const eventType = url.searchParams.get('type');
  const successFilter = url.searchParams.get('success');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10);

  // Build query
  let query = supabase
    .from('abuse_events')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Apply filters
  if (ipFilter) {
    query = query.ilike('ip_address', `%${ipFilter}%`);
  }

  if (eventType) {
    query = query.eq('event_type', eventType as AbuseEventType);
  }

  if (successFilter !== null && successFilter !== undefined) {
    query = query.eq('success', successFilter === 'true');
  }

  // Apply pagination
  const start = (page - 1) * pageSize;
  query = query.range(start, start + pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching abuse events:', error);
    return NextResponse.json(
      { message: 'Error fetching abuse events' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data,
    count,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 0,
  });
}

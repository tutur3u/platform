import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

export async function GET(req: Request) {
  await connection();

  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const supabase = authorization.sbAdmin;

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
    query = query.eq('event_type', eventType as never);
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

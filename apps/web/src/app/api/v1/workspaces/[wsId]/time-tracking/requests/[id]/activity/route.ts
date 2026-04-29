import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_SHORT_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_SHORT_TEXT_LENGTH)
    .default(5),
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

  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify user has access to this workspace
  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (member.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!member.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the request belongs to this workspace
  const { data: request, error: requestError } = await sbAdmin
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
  const { count: totalCount, error: countError } = await sbAdmin
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
  const { data: activities, error } = await sbAdmin
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

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  isRequestableFeature,
  REQUESTABLE_KEY_TO_FEATURE_FLAG,
} from '@tuturuuu/utils/feature-flags/requestable-features';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
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

    // Check if user is platform admin (root workspace admin/owner)
    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .eq('user_id', user.id)
      .single();

    if (
      memberError ||
      !memberCheck ||
      !['ADMIN', 'OWNER'].includes(memberCheck.role)
    ) {
      return NextResponse.json(
        {
          error:
            'Insufficient permissions. Only platform administrators can access this endpoint.',
        },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const status = searchParams.get('status');
    const q = searchParams.get('q');
    const feature = searchParams.get('feature');

    // Use admin client for broader access
    const sbAdmin = await createAdminClient();

    // Build query
    let query = sbAdmin.from('workspace_education_access_requests').select(
      `
        id,
        ws_id,
        workspace_name,
        creator_id,
        message,
        status,
        feature,
        admin_notes,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at,
        users!workspace_education_access_requests_creator_id_fkey(
          id,
          display_name,
          avatar_url,
          ...user_private_details(email)
        ),
        reviewed_user:users!workspace_education_access_requests_reviewed_by_fkey(
          id,
          display_name,
          ...user_private_details(email)
        )
      `,
      { count: 'exact' }
    );

    // Apply status filter
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Apply feature filter
    if (feature && feature !== 'all') {
      // Only apply filter for valid requestable features
      if (isRequestableFeature(feature)) {
        const featureFlag = REQUESTABLE_KEY_TO_FEATURE_FLAG[feature];
        query = query.eq('feature', featureFlag);
      }
    }

    // Apply search filter
    if (q) {
      query = query.or(`workspace_name.ilike.%${q}%, message.ilike.%${q}%`);
    }

    // Apply pagination
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(start, end);

    const { data: requests, error: requestsError, count } = await query;

    if (requestsError) {
      console.error('Database error:', requestsError);
      return NextResponse.json(
        { error: 'Failed to fetch education access requests' },
        { status: 500 }
      );
    }

    // Transform data to match expected format
    const transformedRequests =
      requests?.map((request) => ({
        id: request.id,
        workspace_id: request.ws_id,
        workspace_name: request.workspace_name,
        creator_id: request.creator_id,
        creator_name:
          request.users?.display_name || request.users?.email || 'Unknown User',
        creator_email: request.users?.email,
        creator_avatar: request.users?.avatar_url,
        feature_requested: request.feature,
        request_message: request.message,
        status: request.status,
        admin_notes: request.admin_notes,
        reviewed_by: request.reviewed_by,
        reviewed_by_name:
          request.reviewed_user?.display_name || request.reviewed_user?.email,
        reviewed_at: request.reviewed_at,
        created_at: request.created_at,
        updated_at: request.updated_at,
      })) || [];

    return NextResponse.json({
      data: transformedRequests,
      count: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

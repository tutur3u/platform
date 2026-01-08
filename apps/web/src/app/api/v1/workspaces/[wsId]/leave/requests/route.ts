import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createLeaveRequestSchema = z.object({
  user_id: z.string().uuid(),
  leave_type_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_half_day_start: z.boolean().default(false),
  is_half_day_end: z.boolean().default(false),
  reason: z.string().min(1),
  notes: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  const leaveTypeId = searchParams.get('leaveTypeId');
  const status = searchParams.get('status');
  const year = searchParams.get('year');

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view leave requests (filtered by permission)
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // Get current user to determine if they can see all requests
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canManageWorkforce = permissions.containsPermission('manage_workforce');

  let query = supabase
    .from('leave_requests')
    .select(
      `
      *,
      leave_type:leave_types(*),
      user:workspace_users!leave_requests_user_id_fkey(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      ),
      approver:users!leave_requests_approved_by_fkey(id, display_name, avatar_url)
    `
    )
    .eq('ws_id', normalizedWsId);

  // If not a manager, only show own requests
  if (!canManageWorkforce) {
    const { data: workspaceUser } = await supabase
      .from('workspace_users')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', currentUser.id)
      .single();

    if (!workspaceUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    query = query.eq('user_id', workspaceUser.id);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (leaveTypeId) {
    query = query.eq('leave_type_id', leaveTypeId);
  }

  if (status) {
    const validStatuses = [
      'approved',
      'cancelled',
      'pending',
      'rejected',
      'withdrawn',
    ] as const;
    if (validStatuses.includes(status as any)) {
      query = query.eq('status', status as (typeof validStatuses)[number]);
    }
  }

  if (year) {
    query = query.gte('start_date', `${year}-01-01`);
    query = query.lte('end_date', `${year}-12-31`);
  }

  query = query.order('start_date', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching leave requests:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can create leave requests
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = createLeaveRequestSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify that target user belongs to this workspace
  const { data: targetWorkspaceUser } = await supabase
    .from('workspace_users')
    .select('id')
    .eq('id', validation.data.user_id)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!targetWorkspaceUser) {
    return NextResponse.json(
      { error: 'User not found in this workspace' },
      { status: 404 }
    );
  }

  // Check if current user can create requests for this user
  const canManageWorkforce = permissions.containsPermission('manage_workforce');

  if (!canManageWorkforce) {
    // Get current user's workspace_user record
    const { data: currentWorkspaceUser } = await supabase
      .from('workspace_users')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (
      !currentWorkspaceUser ||
      currentWorkspaceUser.id !== validation.data.user_id
    ) {
      return NextResponse.json(
        { error: 'You can only create leave requests for yourself' },
        { status: 403 }
      );
    }
  }

  // Verify that leave type belongs to this workspace and is active
  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('id, is_active, requires_approval')
    .eq('id', validation.data.leave_type_id)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!leaveType) {
    return NextResponse.json(
      { error: 'Leave type not found in this workspace' },
      { status: 404 }
    );
  }

  if (!leaveType.is_active) {
    return NextResponse.json(
      { error: 'This leave type is no longer active' },
      { status: 400 }
    );
  }

  // Validate date range
  if (validation.data.start_date > validation.data.end_date) {
    return NextResponse.json(
      { error: 'Start date must be before or equal to end date' },
      { status: 400 }
    );
  }

  // Call database function to calculate duration
  const { data: durationData, error: durationError } = await supabase.rpc(
    'calculate_leave_duration',
    {
      p_start_date: validation.data.start_date,
      p_end_date: validation.data.end_date,
      p_ws_id: normalizedWsId,
      p_is_half_day_start: validation.data.is_half_day_start,
      p_is_half_day_end: validation.data.is_half_day_end,
    }
  );

  if (durationError) {
    console.error('Error calculating duration:', durationError);
    return NextResponse.json(
      { error: 'Failed to calculate leave duration' },
      { status: 500 }
    );
  }

  const duration = durationData as number;

  if (duration <= 0) {
    return NextResponse.json(
      { error: 'Leave duration must be greater than 0' },
      { status: 400 }
    );
  }

  // Determine initial status based on approval requirement
  const initialStatus: 'pending' | 'approved' = leaveType.requires_approval
    ? 'pending'
    : 'approved';

  const { data, error } = await supabase
    .from('leave_requests')
    .insert({
      ws_id: normalizedWsId,
      user_id: validation.data.user_id,
      leave_type_id: validation.data.leave_type_id,
      start_date: validation.data.start_date,
      end_date: validation.data.end_date,
      is_half_day_start: validation.data.is_half_day_start,
      is_half_day_end: validation.data.is_half_day_end,
      duration_days: duration,
      reason: validation.data.reason,
      notes: validation.data.notes,
      emergency_contact: validation.data.emergency_contact,
      status: initialStatus,
      submitted_by: user.id,
    })
    .select(
      `
      *,
      leave_type:leave_types(*),
      user:workspace_users!leave_requests_user_id_fkey(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      )
    `
    )
    .single();

  if (error) {
    console.error('Error creating leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

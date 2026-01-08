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

  // Validate status if provided
  let validatedStatus: string | undefined;
  if (status) {
    const validStatuses = [
      'approved',
      'cancelled',
      'pending',
      'rejected',
      'withdrawn',
    ] as const;
    if (validStatuses.includes(status as any)) {
      validatedStatus = status;
    }
  }

  const { data, error } = await supabase.rpc(
    'get_leave_requests_with_details',
    {
      p_ws_id: normalizedWsId,
      p_user_id: currentUser.id,
      p_filter_user_id: userId || undefined,
      p_filter_leave_type_id: leaveTypeId || undefined,
      p_filter_status: validatedStatus,
      p_filter_year: year ? parseInt(year, 10) : undefined,
      p_can_manage_workforce: canManageWorkforce,
    }
  );

  if (error) {
    console.error('Error fetching leave requests:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
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

  // Call RPC to create leave request
  const { data, error } = await supabase.rpc(
    'create_leave_request_with_details',
    {
      p_ws_id: normalizedWsId,
      p_user_id: validation.data.user_id,
      p_leave_type_id: validation.data.leave_type_id,
      p_start_date: validation.data.start_date,
      p_end_date: validation.data.end_date,
      p_reason: validation.data.reason,
      p_is_half_day_start: validation.data.is_half_day_start,
      p_is_half_day_end: validation.data.is_half_day_end,
      p_notes: validation.data.notes || undefined,
      p_emergency_contact: validation.data.emergency_contact || undefined,
      p_submitted_by: user.id,
    }
  );

  if (error) {
    console.error('Error creating leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

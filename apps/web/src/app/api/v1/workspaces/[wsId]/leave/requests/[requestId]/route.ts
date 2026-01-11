import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateLeaveRequestSchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  is_half_day_start: z.boolean().optional(),
  is_half_day_end: z.boolean().optional(),
  reason: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; requestId: string }> }
) {
  const { wsId, requestId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view leave requests (filtered by permission)
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
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
    .eq('id', requestId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Leave request not found' },
      { status: 404 }
    );
  }

  // Check if user can view this request
  const canManageWorkforce = permissions.containsPermission('manage_workforce');

  if (!canManageWorkforce) {
    // Get workspace user ID for current user
    const { data: workspaceUser } = await supabase
      .from('workspace_users')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', currentUser.id)
      .single();

    if (!workspaceUser || data.user_id !== workspaceUser.id) {
      return NextResponse.json(
        { error: 'You can only view your own leave requests' },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; requestId: string }> }
) {
  const { wsId, requestId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can edit their own requests (if pending)
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updateLeaveRequestSchema.safeParse(body);

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

  // Get existing request
  const { data: existingRequest } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!existingRequest) {
    return NextResponse.json(
      { error: 'Leave request not found' },
      { status: 404 }
    );
  }

  // Check permissions
  const canManageWorkforce = permissions.containsPermission('manage_workforce');

  // Get current user's workspace_user record to check if they own this request
  const { data: currentWorkspaceUser } = await supabase
    .from('workspace_users')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', user.id)
    .single();

  const isOwnRequest = currentWorkspaceUser?.id === existingRequest.user_id;

  if (!canManageWorkforce && !isOwnRequest) {
    return NextResponse.json(
      { error: 'You can only edit your own leave requests' },
      { status: 403 }
    );
  }

  // Only allow editing if request is pending or withdrawn
  if (!['pending', 'withdrawn'].includes(existingRequest.status)) {
    return NextResponse.json(
      {
        error:
          'Can only edit pending or withdrawn requests. Cancel this request and create a new one.',
      },
      { status: 400 }
    );
  }

  const updateData: any = { ...validation.data };

  // Recalculate duration if dates changed
  if (
    validation.data.start_date ||
    validation.data.end_date ||
    validation.data.is_half_day_start !== undefined ||
    validation.data.is_half_day_end !== undefined
  ) {
    const startDate = validation.data.start_date || existingRequest.start_date;
    const endDate = validation.data.end_date || existingRequest.end_date;
    const isHalfDayStart =
      validation.data.is_half_day_start !== undefined
        ? validation.data.is_half_day_start
        : (existingRequest.is_half_day_start ?? false);
    const isHalfDayEnd =
      validation.data.is_half_day_end !== undefined
        ? validation.data.is_half_day_end
        : (existingRequest.is_half_day_end ?? false);

    // Validate date range
    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'Start date must be before or equal to end date' },
        { status: 400 }
      );
    }

    // Call database function to calculate duration
    const { data: durationData, error: durationError } = await supabase.rpc(
      'calculate_leave_duration',
      {
        p_start_date: startDate,
        p_end_date: endDate,
        p_ws_id: normalizedWsId,
        p_is_half_day_start: isHalfDayStart,
        p_is_half_day_end: isHalfDayEnd,
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

    updateData.duration_days = duration;
  }

  const { data, error } = await supabase
    .from('leave_requests')
    .update(updateData)
    .eq('id', requestId)
    .eq('ws_id', normalizedWsId)
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
    .single();

  if (error) {
    console.error('Error updating leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; requestId: string }> }
) {
  const { wsId, requestId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  const canManageWorkforce = permissions.containsPermission('manage_workforce');

  if (!canManageWorkforce) {
    return NextResponse.json(
      { error: 'Only managers can delete leave requests' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('leave_requests')
    .delete()
    .eq('id', requestId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

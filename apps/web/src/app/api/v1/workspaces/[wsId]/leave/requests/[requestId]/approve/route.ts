import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const approvalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejection_reason: z.string().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; requestId: string }> }
) {
  const { wsId, requestId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json(
      { error: 'Only managers can approve or reject leave requests' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const validation = approvalSchema.safeParse(body);

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
  const { data: existingRequest, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (fetchError || !existingRequest) {
    console.error('Error fetching leave request:', fetchError);
    return NextResponse.json(
      { error: 'Leave request not found' },
      { status: 404 }
    );
  }

  // Check if request is pending
  if (existingRequest.status !== 'pending') {
    return NextResponse.json(
      {
        error: `Cannot ${validation.data.action} a request with status: ${existingRequest.status}`,
      },
      { status: 400 }
    );
  }

  // Validate rejection reason if rejecting
  if (
    validation.data.action === 'reject' &&
    !validation.data.rejection_reason
  ) {
    return NextResponse.json(
      { error: 'Rejection reason is required when rejecting a request' },
      { status: 400 }
    );
  }

  const newStatus =
    validation.data.action === 'approve' ? 'approved' : 'rejected';
  const now = new Date().toISOString();

  const updateData: any = {
    status: newStatus,
    approved_by: user.id,
    approved_at: now,
  };

  if (validation.data.action === 'reject') {
    updateData.rejection_reason = validation.data.rejection_reason;
  }

  // Update the request
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

import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const cancelSchema = z.object({
  cancellation_reason: z.string().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; requestId: string }> }
) {
  const { wsId, requestId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can cancel their own requests
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = cancelSchema.safeParse(body);

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

  // Check permissions - only the requester or managers can cancel
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
      { error: 'You can only cancel your own leave requests' },
      { status: 403 }
    );
  }

  // Check if request can be cancelled
  if (!['pending', 'approved'].includes(existingRequest.status)) {
    return NextResponse.json(
      {
        error: `Cannot cancel a request with status: ${existingRequest.status}`,
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const updateData: any = {
    status: 'cancelled',
    cancelled_at: now,
    cancellation_reason: validation.data.cancellation_reason,
  };

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
    console.error('Error cancelling leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

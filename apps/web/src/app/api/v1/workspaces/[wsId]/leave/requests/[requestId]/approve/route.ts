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

  // Call RPC to approve/reject leave request
  const { data, error } = await supabase.rpc(
    'approve_leave_request_with_details',
    {
      p_request_id: requestId,
      p_ws_id: normalizedWsId,
      p_action: validation.data.action,
      p_user_id: user.id,
      p_rejection_reason: validation.data.rejection_reason || undefined,
    }
  );

  if (error) {
    console.error('Error updating leave request:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Leave request not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}


import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
  }),
  z.object({
    action: z.literal('reject'),
    rejection_reason: z.string().min(1, 'Rejection reason is required'),
  }),
  z.object({
    action: z.literal('needs_info'),
    needs_info_reason: z.string().min(1, 'Needs info reason is required'),
  }),
  z.object({
    action: z.literal('resubmit'),
  }),
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ wsId: string; id: string }> }
) {
  try {
    const { wsId, id } = await context.params;

    // Parse and validate request body
    const body = await request.json();
    const validation = updateRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access and admin permissions
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { withoutPermission, containsPermission } = await getPermissions({
      wsId,
    });

    const actionData = validation.data;

    // For resubmit action, skip permission check as request owners can resubmit their own requests
    // The RPC function will validate that the user is the request owner
    if (actionData.action !== 'resubmit') {
      if (withoutPermission('manage_time_tracking_requests')) {
        return NextResponse.json(
          {
            error: 'You do not have permission to manage time tracking requests.',
          },
          { status: 403 }
        );
      }
    }

    const canBypass = containsPermission(
      'bypass_time_tracking_request_approval'
    );

    // Use the centralized RPC function to handle the update
    const { data, error: rpcError } = await supabase.rpc(
      'update_time_tracking_request',
      {
        p_request_id: id,
        p_action: actionData.action,
        p_workspace_id: wsId,
        p_bypass_rules: canBypass,
        p_rejection_reason:
          actionData.action === 'reject'
            ? actionData.rejection_reason
            : undefined,
        p_needs_info_reason:
          actionData.action === 'needs_info'
            ? actionData.needs_info_reason
            : undefined,
      }
    );

    if (rpcError) {
      console.error('Error updating time tracking request:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to update request' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      'Unexpected error in PATCH /time-tracking/requests/[id]:',
      error
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

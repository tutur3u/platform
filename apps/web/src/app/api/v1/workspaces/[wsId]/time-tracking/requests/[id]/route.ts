import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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
    const sbAdmin = await createAdminClient();

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

    // // Check if user has manage_time_tracking permission
    // const { data: permissions } = await supabase.rpc(
    //   'get_user_permissions_v2',
    //   {
    //     target_ws_id: wsId,
    //     target_user_id: user.id,
    //   }
    // );

    // const hasPermission = permissions?.some(
    //   (p: { id: string; enabled: boolean }) =>
    //     p.id === 'manage_time_tracking' && p.enabled
    // );

    // if (!hasPermission) {
    //   return NextResponse.json(
    //     { error: 'Insufficient permissions to manage time tracking requests' },
    //     { status: 403 }
    //   );
    // }

    // Get the current request
    const { data: currentRequest, error: fetchError } = await sbAdmin
      .from('time_tracking_requests')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', wsId)
      .single();

    if (fetchError || !currentRequest) {
      return NextResponse.json(
        { error: 'Time tracking request not found' },
        { status: 404 }
      );
    }

    // Check if already processed
    if (currentRequest.approval_status !== 'PENDING') {
      return NextResponse.json(
        {
          error: `Request has already been ${currentRequest.approval_status.toLowerCase()}`,
        },
        { status: 400 }
      );
    }

    const actionData = validation.data;

    if (actionData.action === 'approve') {
      // Approve the request and create the time tracking session
      const { error: approveError } = await sbAdmin
        .from('time_tracking_requests')
        .update({
          approval_status: 'APPROVED',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (approveError) {
        console.error('Error approving request:', approveError);
        return NextResponse.json(
          { error: 'Failed to approve request' },
          { status: 500 }
        );
      }

      // Calculate duration
      const startTime = new Date(currentRequest.start_time);
      const endTime = new Date(currentRequest.end_time);
      const durationSeconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000
      );

      // Use the bypassed insert function to create the session
      const { data: session, error: sessionError } = await sbAdmin.rpc(
        'insert_time_tracking_session_bypassed',
        {
          p_ws_id: wsId,
          p_user_id: currentRequest.user_id,
          p_title: currentRequest.title,
          p_description: currentRequest.description || '',
          p_category_id: currentRequest.category_id || undefined,
          p_task_id: currentRequest.task_id || undefined,
          p_start_time: currentRequest.start_time,
          p_end_time: currentRequest.end_time,
          p_duration_seconds: durationSeconds,
        }
      );

      if (sessionError) {
        console.error('Error creating time tracking session:', sessionError);
        // Rollback approval
        await sbAdmin
          .from('time_tracking_requests')
          .update({
            approval_status: 'PENDING',
            approved_by: null,
            approved_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        return NextResponse.json(
          { error: 'Failed to create time tracking session' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Request approved and time tracking session created',
        session,
      });
    } else {
      // Reject the request
      const { error: rejectError } = await sbAdmin
        .from('time_tracking_requests')
        .update({
          approval_status: 'REJECTED',
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: actionData.rejection_reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (rejectError) {
        console.error('Error rejecting request:', rejectError);
        return NextResponse.json(
          { error: 'Failed to reject request' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Request rejected',
      });
    }
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

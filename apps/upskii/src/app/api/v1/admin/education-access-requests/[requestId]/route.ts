import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    requestId: string;
  }>;
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { requestId } = await params;

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
            'Insufficient permissions. Only platform administrators can approve requests.',
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { status, admin_notes } = body;

    // Validate status
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected".' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Get the current request to check if it exists and get workspace info
    const { data: currentRequest, error: fetchError } = await sbAdmin
      .from('workspace_education_access_requests')
      .select('id, ws_id, workspace_name, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !currentRequest) {
      return NextResponse.json(
        { error: 'Education access request not found' },
        { status: 404 }
      );
    }

    // Allow status changes - admin can change between approved/rejected states
    // No need to restrict based on current status

    // Start a transaction-like operation
    try {
      // Update the request status
      const { error: updateError } = await sbAdmin
        .from('workspace_education_access_requests')
        .update({
          status,
          admin_notes: admin_notes || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) {
        throw new Error('Failed to update request status');
      }

      // If approved, enable education features for the workspace
      if (status === 'approved') {
        // Check if ENABLE_EDUCATION secret already exists
        const { data: existingSecret } = await sbAdmin
          .from('workspace_secrets')
          .select('id')
          .eq('ws_id', currentRequest.ws_id)
          .eq('name', 'ENABLE_EDUCATION')
          .single();

        if (existingSecret) {
          // Update existing secret
          const { error: secretUpdateError } = await sbAdmin
            .from('workspace_secrets')
            .update({ value: 'true' })
            .eq('id', existingSecret.id);

          if (secretUpdateError) {
            console.error(
              'Failed to update education secret:',
              secretUpdateError
            );
            // Don't fail the whole operation, just log the error
          }
        } else {
          // Create new secret
          const { error: secretCreateError } = await sbAdmin
            .from('workspace_secrets')
            .insert({
              ws_id: currentRequest.ws_id,
              name: 'ENABLE_EDUCATION',
              value: 'true',
            });

          if (secretCreateError) {
            console.error(
              'Failed to create education secret:',
              secretCreateError
            );
            // Don't fail the whole operation, just log the error
          }
        }
      }

      // If rejected and was previously approved, disable education features
      if (status === 'rejected') {
        const { error: secretDeleteError } = await sbAdmin
          .from('workspace_secrets')
          .delete()
          .eq('ws_id', currentRequest.ws_id)
          .eq('name', 'ENABLE_EDUCATION');

        if (secretDeleteError) {
          console.error(
            'Failed to remove education secret:',
            secretDeleteError
          );
          // Don't fail the whole operation, just log the error
        }
      }

      // Get the updated request with user details
      const { data: updatedRequest, error: refetchError } = await sbAdmin
        .from('workspace_education_access_requests')
        .select(
          `
          id,
          ws_id,
          workspace_name,
          creator_id,
          message,
          status,
          admin_notes,
          reviewed_by,
          reviewed_at,
          created_at,
          updated_at,
          users!workspace_education_access_requests_creator_id_fkey(
            id,
            display_name,
            ...user_private_details(email)
          ),
          reviewed_user:users!workspace_education_access_requests_reviewed_by_fkey(
            id,
            display_name,
            ...user_private_details(email)
          )
        `
        )
        .eq('id', requestId)
        .single();

      if (refetchError) {
        console.error('Failed to refetch updated request:', refetchError);
      }

      const responseData = {
        message: `Education access request ${status} successfully`,
        request: updatedRequest
          ? {
              id: updatedRequest.id,
              workspace_id: updatedRequest.ws_id,
              workspace_name: updatedRequest.workspace_name,
              creator_id: updatedRequest.creator_id,
              creator_name:
                updatedRequest.users?.display_name ||
                updatedRequest.users?.email ||
                'Unknown User',
              feature_requested: 'Education Features',
              request_message: updatedRequest.message,
              status: updatedRequest.status,
              admin_notes: updatedRequest.admin_notes,
              reviewed_by: updatedRequest.reviewed_by,
              reviewed_by_name:
                updatedRequest.reviewed_user?.display_name ||
                updatedRequest.reviewed_user?.email,
              reviewed_at: updatedRequest.reviewed_at,
              created_at: updatedRequest.created_at,
              updated_at: updatedRequest.updated_at,
            }
          : null,
      };

      return NextResponse.json(responseData, { status: 200 });
    } catch (error) {
      console.error('Transaction error:', error);
      return NextResponse.json(
        { error: 'Failed to process request approval' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
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

// PUT endpoint for owner to update request content (title, description, times, images)
// Only allowed when status is PENDING or NEEDS_INFO
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ wsId: string; id: string }> }
) {
  try {
    const { wsId, id } = await context.params;
    const supabase = await createClient();
    const storageClient = await createDynamicClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace membership
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

    // Fetch the existing request
    const { data: existingRequest, error: fetchError } = await supabase
      .from('time_tracking_requests')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', wsId)
      .single();

    if (fetchError || !existingRequest) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    // Check if user is the request owner
    if (existingRequest.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the request owner can edit this request' },
        { status: 403 }
      );
    }

    // Check if request is in an editable status
    if (
      existingRequest.approval_status !== 'PENDING' &&
      existingRequest.approval_status !== 'NEEDS_INFO'
    ) {
      return NextResponse.json(
        {
          error: 'Request can only be edited when status is Pending or Needs Info',
        },
        { status: 400 }
      );
    }

    // Parse FormData
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const description = formData.get('description') as string | null;
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;
    const removedImagesJson = formData.get('removedImages') as string | null;

    // Validate required fields
    if (!title || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Title, start time, and end time are required' },
        { status: 400 }
      );
    }

    // Handle removed images
    let currentImages: string[] = existingRequest.images || [];
    if (removedImagesJson) {
      try {
        const removedImages: string[] = JSON.parse(removedImagesJson);
        // Remove specified images from the list
        currentImages = currentImages.filter(
          (img) => !removedImages.includes(img)
        );
        // Delete removed images from storage
        if (removedImages.length > 0) {
          await storageClient.storage
            .from('time_tracking_requests')
            .remove(removedImages);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Handle new image uploads
    const imageEntries = Array.from(formData.entries()).filter(([key]) =>
      key.startsWith('image_')
    );

    let uploadedImagePaths: string[] = [];
    if (imageEntries.length > 0) {
      try {
        uploadedImagePaths = await Promise.all(
          imageEntries.map(async ([key, imageFile]) => {
            if (!(imageFile instanceof File)) {
              throw new Error(`Invalid image in field ${key}`);
            }

            const fileName = `${id}/${uuidv4()}_${imageFile.name}`;
            const buffer = await imageFile.arrayBuffer();

            const { data, error } = await storageClient.storage
              .from('time_tracking_requests')
              .upload(fileName, buffer, {
                contentType: imageFile.type,
              });

            if (error) {
              console.error('Storage upload error:', error);
              throw new Error(`Failed to upload image: ${error.message}`);
            }

            return data.path;
          })
        );
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        // Clean up uploaded images on error
        if (uploadedImagePaths.length > 0) {
          await storageClient.storage
            .from('time_tracking_requests')
            .remove(uploadedImagePaths);
        }
        return NextResponse.json(
          {
            error:
              uploadError instanceof Error
                ? uploadError.message
                : 'Failed to upload images',
          },
          { status: 400 }
        );
      }
    }

    // Combine existing and new images
    const finalImages = [...currentImages, ...uploadedImagePaths];

    // Update the request
    const { data: updatedRequest, error: updateError } = await supabase
      .from('time_tracking_requests')
      .update({
        title,
        description: description || null,
        start_time: startTime,
        end_time: endTime,
        images: finalImages.length > 0 ? finalImages : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      // Clean up newly uploaded images on database error
      if (uploadedImagePaths.length > 0) {
        await storageClient.storage
          .from('time_tracking_requests')
          .remove(uploadedImagePaths);
      }
      console.error('Database error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update request' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: updatedRequest,
    });
  } catch (error) {
    console.error(
      'Unexpected error in PUT /time-tracking/requests/[id]:',
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

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const updateRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
  }),
  z.object({
    action: z.literal('reject'),
    rejection_reason: z
      .string()
      .max(MAX_SEARCH_LENGTH)
      .min(1, 'Rejection reason is required'),
  }),
  z.object({
    action: z.literal('needs_info'),
    needs_info_reason: z
      .string()
      .max(MAX_SEARCH_LENGTH)
      .min(1, 'Needs info reason is required'),
  }),
  z.object({
    action: z.literal('resubmit'),
  }),
]);

const editRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  removedImages: z.array(z.string().min(1)).optional().default([]),
  newImagePaths: z.array(z.string().min(1)).optional().default([]),
});

type StorageRemoveClient = Pick<
  Awaited<ReturnType<typeof createDynamicClient>>,
  'storage'
>;

async function removeRequestImagesWithFallback({
  paths,
  primaryClient,
  fallbackClient,
}: {
  paths: string[];
  primaryClient: StorageRemoveClient;
  fallbackClient: StorageRemoveClient;
}): Promise<{ error: unknown | null; fallbackUsed: boolean }> {
  if (paths.length === 0) {
    return { error: null, fallbackUsed: false };
  }

  const { error: primaryError } = await primaryClient.storage
    .from('time_tracking_requests')
    .remove(paths);

  if (!primaryError) {
    return { error: null, fallbackUsed: false };
  }

  const { error: fallbackError } = await fallbackClient.storage
    .from('time_tracking_requests')
    .remove(paths);

  if (!fallbackError) {
    return { error: null, fallbackUsed: true };
  }

  return {
    error: {
      primaryError,
      fallbackError,
    },
    fallbackUsed: true,
  };
}

function validateRequestImagePaths(
  paths: string[],
  requestId: string
): { valid: true } | { valid: false; error: string } {
  for (const p of paths) {
    if (!p.startsWith(`${requestId}/`)) {
      return {
        valid: false,
        error: 'Invalid image path: must start with request ID prefix',
      };
    }
    if (p.includes('..')) {
      return {
        valid: false,
        error: 'Invalid image path: path traversal not allowed',
      };
    }
  }
  return { valid: true };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ wsId: string; id: string }> }
) {
  try {
    const { wsId, id } = await context.params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    // Parse and validate request body
    const body = await request.json();
    const validation = updateRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access and admin permissions
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request,
    });
    if (!permissions) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const { withoutPermission } = permissions;

    const actionData = validation.data;

    // For resubmit action, skip permission check as request owners can resubmit their own requests
    // The RPC function will validate that the user is the request owner
    if (actionData.action !== 'resubmit') {
      if (withoutPermission('manage_time_tracking_requests')) {
        return NextResponse.json(
          {
            error:
              'You do not have permission to manage time tracking requests.',
          },
          { status: 403 }
        );
      }
    }

    // Use the centralized RPC function to handle the update
    const { data, error: rpcError } = await supabase.rpc(
      'update_time_tracking_request',
      {
        p_request_id: id,
        p_action: actionData.action,
        p_workspace_id: normalizedWsId,
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
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    // Use createDynamicClient with request to support Bearer token auth for mobile apps
    const storageClient = await createDynamicClient(request);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    // Verify workspace membership
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Fetch the existing request
    const { data: existingRequest, error: fetchError } = await sbAdmin
      .from('time_tracking_requests')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', normalizedWsId)
      .single();

    if (fetchError || !existingRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
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
          error:
            'Request can only be edited when status is Pending or Needs Info',
        },
        { status: 400 }
      );
    }

    // Parse JSON body (no multipart)
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          error:
            'Invalid content type. Expected application/json. Images must be uploaded via signed URLs first.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = editRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      startTime,
      endTime,
      removedImages,
      newImagePaths,
    } = validation.data;

    const newPathsValidation = validateRequestImagePaths(newImagePaths, id);
    if (!newPathsValidation.valid) {
      return NextResponse.json(
        { error: newPathsValidation.error },
        { status: 400 }
      );
    }

    const removedPathsValidation = validateRequestImagePaths(removedImages, id);
    if (!removedPathsValidation.valid) {
      return NextResponse.json(
        { error: removedPathsValidation.error },
        { status: 400 }
      );
    }

    // Handle removed images
    let currentImages: string[] = existingRequest.images || [];
    if (removedImages.length > 0) {
      // Remove specified images from the list
      currentImages = currentImages.filter(
        (img) => !removedImages.includes(img)
      );
      // Delete removed images from storage
      const { error: removeError, fallbackUsed } =
        await removeRequestImagesWithFallback({
          paths: removedImages,
          primaryClient: storageClient,
          fallbackClient: sbAdmin,
        });

      if (removeError) {
        console.error('Failed to remove deleted images from storage:', {
          requestId: id,
          removedImages,
          error: removeError,
        });
        return NextResponse.json(
          { error: 'Failed to remove deleted images' },
          { status: 500 }
        );
      }

      if (fallbackUsed) {
        console.warn('Removed request images via admin fallback cleanup:', {
          requestId: id,
          removedImages,
        });
      }
    }

    // Combine existing and newly uploaded image paths
    const finalImages = [...currentImages, ...newImagePaths];

    // Update the request through an admin RPC while preserving the caller's
    // auth context for SQL trigger enforcement.
    const { data: updatedRequest, error: updateError } = await sbAdmin.rpc(
      'update_time_tracking_request_content',
      {
        p_request_id: id,
        p_workspace_id: normalizedWsId,
        p_actor_auth_uid: user.id,
        p_title: title,
        p_description: description || undefined,
        p_start_time: startTime,
        p_end_time: endTime,
        p_images: finalImages.length > 0 ? finalImages : undefined,
      }
    );

    if (updateError) {
      // Clean up newly uploaded images on database error
      if (newImagePaths.length > 0) {
        const { error: cleanupError, fallbackUsed } =
          await removeRequestImagesWithFallback({
            paths: newImagePaths,
            primaryClient: storageClient,
            fallbackClient: sbAdmin,
          });

        if (cleanupError) {
          console.error('Failed to clean up newly uploaded images:', {
            requestId: id,
            newImagePaths,
            updateError,
            cleanupError,
          });
          return NextResponse.json(
            {
              error:
                'Failed to update request and failed to clean up uploaded images',
            },
            { status: 500 }
          );
        }

        if (fallbackUsed) {
          console.warn(
            'Cleaned up newly uploaded request images via admin fallback:',
            {
              requestId: id,
              newImagePaths,
              updateError,
            }
          );
        }
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

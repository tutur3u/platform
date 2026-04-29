import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  getWorkspaceConfig,
  normalizeWorkspaceId,
} from '@/lib/workspace-helper';

const TimeTrackingRequestSchema = z.object({
  requestId: z.guid().optional(),
  title: z.string().max(MAX_NAME_LENGTH).min(1),
  description: z.string().optional().default(''),
  categoryId: z.string().optional().default(''),
  taskId: z.string().optional().default(''),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  breakTypeId: z.guid().nullable().optional(),
  breakTypeName: z.string().nullable().optional(),
  linkedSessionId: z.guid().nullable().optional(),
  imagePaths: z.array(z.string().min(1)).max(5).optional().default([]),
});

function validateImagePaths(
  imagePaths: string[],
  requestId: string
): { valid: true } | { valid: false; error: string } {
  for (const p of imagePaths) {
    if (!p.startsWith(`${requestId}/`)) {
      return {
        valid: false,
        error: `Invalid image path: must start with request ID prefix`,
      };
    }
    if (p.includes('..')) {
      return {
        valid: false,
        error: `Invalid image path: path traversal not allowed`,
      };
    }
  }
  return { valid: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
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

    const rawBody = await request.json();
    const validationResult = TimeTrackingRequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const parsed = validationResult.data;
    const requestId = parsed.requestId ?? uuidv4();

    const pathValidation = validateImagePaths(parsed.imagePaths, requestId);
    if (!pathValidation.valid) {
      return NextResponse.json(
        { error: pathValidation.error },
        { status: 400 }
      );
    }

    const storageClient = await createDynamicClient(request);

    const allowFutureSessions =
      (await getWorkspaceConfig(normalizedWsId, 'ALLOW_FUTURE_SESSIONS')) ===
      'true';

    // Prevent future sessions (unless allowed by config)
    const now = new Date();
    if (!allowFutureSessions) {
      const start = new Date(parsed.startTime);
      if (start > now) {
        return NextResponse.json(
          {
            error:
              'Cannot create a time tracking request with a start time in the future.',
          },
          { status: 400 }
        );
      }
    }

    // Create time tracking request (images already uploaded via signed URLs)
    const { data, error } = await sbAdmin
      .from('time_tracking_requests')
      .insert({
        id: requestId,
        workspace_id: normalizedWsId,
        user_id: user.id,
        task_id: parsed.taskId || null,
        category_id: parsed.categoryId || null,
        title: parsed.title,
        description: parsed.description || null,
        start_time: parsed.startTime,
        end_time: parsed.endTime,
        break_type_id: parsed.breakTypeId || null,
        break_type_name: parsed.breakTypeName || null,
        linked_session_id: parsed.linkedSessionId || null,
        images: parsed.imagePaths.length > 0 ? parsed.imagePaths : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      // Clean up uploaded images on database error
      if (parsed.imagePaths.length > 0) {
        await storageClient.storage
          .from('time_tracking_requests')
          .remove(parsed.imagePaths);
      }
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create time tracking request' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        request: data?.[0],
        message: 'Time tracking request submitted for approval',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
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

    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request,
    });
    if (!permissions) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const canManageAllRequests = permissions.containsPermission(
      'manage_time_tracking_requests'
    );

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending'; // 'pending', 'approved', 'rejected'
    const userId = url.searchParams.get('userId'); // Optional: filter by user
    const normalizedUserId = userId?.trim();
    const requestId = url.searchParams.get('requestId')?.trim();

    if (
      !canManageAllRequests &&
      normalizedUserId &&
      normalizedUserId !== user.id
    ) {
      return NextResponse.json(
        { error: "You do not have permission to view other users' requests." },
        { status: 403 }
      );
    }

    const effectiveUserId = canManageAllRequests ? normalizedUserId : user.id;

    // Safe pagination parsing with bounds checking
    const pageParam = Number(url.searchParams.get('page') || '1');
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const limitParam = Number(url.searchParams.get('limit') || '10');
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.max(limitParam, 1), 100)
        : 10;

    const offset = (page - 1) * limit;

    // Build count query
    let countQuery = sbAdmin
      .from('time_tracking_requests')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', normalizedWsId);

    // Filter by approval status
    if (status === 'pending') {
      countQuery = countQuery.eq('approval_status', 'PENDING');
    } else if (status === 'approved') {
      countQuery = countQuery.eq('approval_status', 'APPROVED');
    } else if (status === 'rejected') {
      countQuery = countQuery.eq('approval_status', 'REJECTED');
    } else if (status === 'needs_info') {
      countQuery = countQuery.eq('approval_status', 'NEEDS_INFO');
    }

    // Filter by user if specified
    if (effectiveUserId) {
      countQuery = countQuery.eq('user_id', effectiveUserId);
    }
    if (requestId) {
      countQuery = countQuery.eq('id', requestId);
    }

    // Execute count query with explicit error handling
    const { count, error: countError } = await countQuery;
    if (countError) {
      return NextResponse.json(
        { error: 'Failed to retrieve record count' },
        { status: 500 }
      );
    }

    const totalCount = Number.isFinite(count) ? count : 0;

    // Build data query with explicit relationship hints
    let query = sbAdmin
      .from('time_tracking_requests')
      .select(
        `
        *,
        user:users!time_tracking_requests_user_id_fkey(
          id,
          display_name,
          avatar_url,
          user_private_details(
            email
          )
        ),
        category:time_tracking_categories(
          id,
          name,
          color
        ),
        task:tasks(
          id,
          name
        ),
        approved_by_user:users!time_tracking_requests_approved_by_fkey(
          id,
          display_name
        ),
        rejected_by_user:users!time_tracking_requests_rejected_by_fkey(
          id,
          display_name
        ),
        needs_info_requested_by_user:users!time_tracking_requests_needs_info_requested_by_fkey(
          id,
          display_name
        )
      `
      )
      .eq('workspace_id', normalizedWsId);

    // Filter by approval status
    if (status === 'pending') {
      query = query.eq('approval_status', 'PENDING');
    } else if (status === 'approved') {
      query = query.eq('approval_status', 'APPROVED');
    } else if (status === 'rejected') {
      query = query.eq('approval_status', 'REJECTED');
    } else if (status === 'needs_info') {
      query = query.eq('approval_status', 'NEEDS_INFO');
    }

    // Filter by user if specified
    if (effectiveUserId) {
      query = query.eq('user_id', effectiveUserId);
    }
    if (requestId) {
      query = query.eq('id', requestId);
    }

    // Apply pagination and ordering
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const totalPages = Math.ceil((totalCount || 0) / limit);

    return NextResponse.json({
      requests: data,
      totalCount,
      totalPages,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

import {
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { type NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  getWorkspaceConfig,
  normalizeWorkspaceId,
} from '@/lib/workspace-helper';

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const TimeTrackingRequestSchema = z.object({
  title: z.string().min(1),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient(request);
    const storageClient = await createDynamicClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Parse FormData
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const categoryId = formData.get('categoryId') as string;
    const taskId = formData.get('taskId') as string;
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;
    const breakTypeId = formData.get('breakTypeId') as string | null;
    const breakTypeName = formData.get('breakTypeName') as string | null;
    const linkedSessionId = formData.get('linkedSessionId') as string | null;

    // Validate using Zod
    const validationResult = TimeTrackingRequestSchema.safeParse({
      title,
      startTime,
      endTime: endTime || undefined,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const {
      startTime: validatedStartTime,
      endTime: validatedEndTime,
      title: validatedTitle,
    } = validationResult.data;

    const allowFutureSessions =
      (await getWorkspaceConfig(normalizedWsId, 'ALLOW_FUTURE_SESSIONS')) ===
      'true';

    // Prevent future sessions (unless allowed by config)
    const now = new Date();
    if (!allowFutureSessions) {
      const start = new Date(validatedStartTime);
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

    const requestId = uuidv4();
    let uploadedImagePaths: string[] = [];

    // Extract and upload images from FormData
    const imageEntries = Array.from(formData.entries()).filter(([key]) =>
      key.startsWith('image_')
    );

    if (imageEntries.length > 0) {
      try {
        uploadedImagePaths = await Promise.all(
          imageEntries.map(async ([key, imageFile]) => {
            if (!(imageFile instanceof File)) {
              throw new Error(`Invalid image in field ${key}`);
            }

            // Validate file size
            if (imageFile.size > MAX_FILE_SIZE) {
              throw new Error(
                `Image ${imageFile.name} exceeds the 1MB size limit`
              );
            }

            // Validate MIME type
            if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
              throw new Error(
                `Invalid file type for ${imageFile.name}. Only JPEG, PNG, WEBP, and GIF are allowed.`
              );
            }

            const sanitizedName = sanitizeFilename(imageFile.name) || 'image';
            const fileName = `${requestId}/${Date.now()}_${sanitizedName}`;
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

    // Create time tracking request
    // linked_session_id links this request to an existing session (e.g., for break pauses)
    // When approved, the session becomes visible; when rejected, the session is deleted
    const { data, error } = await supabase
      .from('time_tracking_requests')
      .insert({
        id: requestId,
        workspace_id: normalizedWsId,
        user_id: user.id,
        task_id: taskId || null,
        category_id: categoryId || null,
        title: validatedTitle,
        description: description || null,
        start_time: validatedStartTime,
        end_time: validatedEndTime,
        break_type_id: breakTypeId || null,
        break_type_name: breakTypeName || null,
        linked_session_id: linkedSessionId || null,
        images: uploadedImagePaths.length > 0 ? uploadedImagePaths : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      // Clean up uploaded images on database error
      if (uploadedImagePaths.length > 0) {
        await storageClient.storage
          .from('time_tracking_requests')
          .remove(uploadedImagePaths);
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

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
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

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending'; // 'pending', 'approved', 'rejected'
    const userId = url.searchParams.get('userId'); // Optional: filter by user

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
    let countQuery = supabase
      .from('time_tracking_requests')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', wsId);

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
    if (userId) {
      countQuery = countQuery.eq('user_id', userId);
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
    let query = supabase
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
      .eq('workspace_id', wsId);

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
    if (userId) {
      query = query.eq('user_id', userId);
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

import {
  createDynamicClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
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

    // Parse FormData
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const categoryId = formData.get('categoryId') as string;
    const taskId = formData.get('taskId') as string;
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;

    // Validate required fields
    if (!title || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
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

            const fileName = `${requestId}/${Date.now()}_${imageFile.name}`;
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
    const { data, error } = await supabase
      .from('time_tracking_requests')
      .insert({
        id: requestId,
        workspace_id: wsId,
        user_id: user.id,
        task_id: taskId || null,
        category_id: categoryId || null,
        title,
        description: description || null,
        start_time: startTime,
        end_time: endTime,
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
    const supabase = await createClient();

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
    const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '10'),
      100
    );
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
    }

    // Filter by user if specified
    if (userId) {
      countQuery = countQuery.eq('user_id', userId);
    }

    const { count: totalCount } = await countQuery;

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

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyTaskShareAccess } from '@/lib/task-perm-helper';

interface ShareParams {
  wsId: string;
  taskId: string;
}

const createShareSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().uuid().optional(),
  permission: z.enum(['view', 'edit']).default('view'),
});

const updateShareSchema = z.object({
  id: z.string().uuid(),
  permission: z.enum(['view', 'edit']),
});

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<ShareParams> }
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;
    const access = await verifyTaskShareAccess(wsId, taskId);

    if (!access.success) {
      return access.response;
    }

    const { supabase, taskId: validatedTaskId } = access.data;

    // Get all shares for this task
    const { data: shares, error: sharesError } = await supabase
      .from('task_shares')
      .select(
        `
        id,
        task_id,
        shared_with_user_id,
        shared_with_email,
        permission,
        shared_by_user_id,
        created_at,
        users:shared_with_user_id (
          id,
          display_name,
          handle,
          avatar_url
        )
      `
      )
      .eq('task_id', validatedTaskId)
      .order('created_at', { ascending: false });

    if (sharesError) {
      console.error('Error fetching shares:', sharesError);
      return NextResponse.json(
        { error: 'Failed to fetch shares' },
        { status: 500 }
      );
    }

    return NextResponse.json({ shares });
  } catch (error) {
    console.error('Error in GET /shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<ShareParams> }
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;
    const access = await verifyTaskShareAccess(wsId, taskId);

    if (!access.success) {
      return access.response;
    }

    const { supabase, user, taskId: validatedTaskId } = access.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        {
          error: 'Invalid JSON',
          details:
            parseError instanceof Error ? parseError.message : 'Parse error',
        },
        { status: 400 }
      );
    }

    const validationResult = createShareSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error },
        { status: 400 }
      );
    }

    const { email, userId, permission } = validationResult.data;

    if (!email && !userId) {
      return NextResponse.json(
        { error: 'Either email or userId must be provided' },
        { status: 400 }
      );
    }

    // Lowercase email if provided
    let normalizedEmail = email?.toLowerCase() || null;
    let normalizedUserId = userId || null;

    // If email provided, try to resolve to userId
    if (normalizedEmail && !normalizedUserId) {
      const { data: userPrivateDetails } = await supabase
        .from('user_private_details')
        .select('user_id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (userPrivateDetails) {
        normalizedUserId = userPrivateDetails.user_id;
        normalizedEmail = null;
      }
    }

    // If userId provided, verify user exists
    if (normalizedUserId) {
      const { data: targetUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', normalizedUserId)
        .single();

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    // Check for existing share to avoid duplicates and handle "updates" via POST
    let existingShareQuery = supabase
      .from('task_shares')
      .select('id')
      .eq('task_id', validatedTaskId);

    if (normalizedUserId) {
      existingShareQuery = existingShareQuery.eq(
        'shared_with_user_id',
        normalizedUserId
      );
    } else if (normalizedEmail) {
      existingShareQuery = existingShareQuery.eq(
        'shared_with_email',
        normalizedEmail as string
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid share recipient' },
        { status: 400 }
      );
    }

    const { data: existingShare } = await existingShareQuery.maybeSingle();

    if (existingShare) {
      // Update existing share
      const { data: share, error: updateError } = await supabase
        .from('task_shares')
        .update({
          permission,
          shared_by_user_id: user.id,
        })
        .eq('id', existingShare.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating existing share:', updateError);
        return NextResponse.json(
          { error: 'Failed to update share' },
          { status: 500 }
        );
      }

      return NextResponse.json({ share }, { status: 200 });
    }

    // Create new share
    const { data: share, error: shareError } = await supabase
      .from('task_shares')
      .insert({
        task_id: validatedTaskId,
        shared_with_user_id: normalizedUserId,
        shared_with_email: normalizedEmail,
        permission,
        shared_by_user_id: user.id,
      })
      .select()
      .single();

    if (shareError) {
      if (shareError.code === '23505') {
        // Unique constraint violation
        return NextResponse.json(
          { error: 'This user already has access to this task' },
          { status: 409 }
        );
      }
      console.error('Error creating share:', shareError);
      return NextResponse.json(
        { error: 'Failed to create share' },
        { status: 500 }
      );
    }

    return NextResponse.json({ share }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<ShareParams> }
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;
    const access = await verifyTaskShareAccess(wsId, taskId);

    if (!access.success) {
      return access.response;
    }

    const { supabase, taskId: validatedTaskId } = access.data;

    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('id');

    // Simple validation for shareId format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!shareId || !uuidRegex.test(shareId)) {
      return NextResponse.json({ error: 'Invalid share ID' }, { status: 400 });
    }

    // Delete share (RLS will verify task belongs to workspace)
    const { error: deleteError } = await supabase
      .from('task_shares')
      .delete()
      .eq('id', shareId)
      .eq('task_id', validatedTaskId);

    if (deleteError) {
      console.error('Error deleting share:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete share' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<ShareParams> }
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;
    const access = await verifyTaskShareAccess(wsId, taskId);

    if (!access.success) {
      return access.response;
    }

    const { supabase, taskId: validatedTaskId } = access.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        {
          error: 'Invalid JSON',
          details:
            parseError instanceof Error ? parseError.message : 'Parse error',
        },
        { status: 400 }
      );
    }

    const validationResult = updateShareSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error },
        { status: 400 }
      );
    }

    const { id: shareId, permission } = validationResult.data;

    // Update share (RLS will verify task belongs to workspace)
    const { data: share, error: updateError } = await supabase
      .from('task_shares')
      .update({ permission })
      .eq('id', shareId)
      .eq('task_id', validatedTaskId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating share:', updateError);
      return NextResponse.json(
        { error: 'Failed to update share' },
        { status: 500 }
      );
    }

    return NextResponse.json({ share });
  } catch (error) {
    console.error('Error in PATCH /shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

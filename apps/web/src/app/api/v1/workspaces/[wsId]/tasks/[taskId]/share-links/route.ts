import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';

interface ShareLinkParams {
  wsId: string;
  taskId: string;
}

const updateShareLinkSchema = z
  .object({
    publicAccess: z.enum(['none', 'view']).optional(),
    requiresInvite: z.boolean().optional(),
  })
  .refine((v) => !(v.requiresInvite === true && v.publicAccess === 'view'), {
    message: 'Invite-only links cannot have public access enabled',
    path: ['publicAccess'],
  });

// Generate a random alphanumeric code
function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const length = 12;
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<ShareLinkParams> }
) {
  try {
    const { wsId, taskId } = await params;

    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Verify task belongs to workspace
    const { data: task } = await supabase
      .from('tasks')
      .select(
        `
        id,
        task_lists!inner (
          id,
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (!task || task.task_lists?.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Task not found in this workspace' },
        { status: 404 }
      );
    }

    // Get single share link for this task
    const { data: existingShareLink, error: existingShareLinkError } =
      await supabase
        .from('task_share_links')
        .select(
          `
          id,
          task_id,
          code,
          public_access,
          requires_invite,
          created_by_user_id,
          created_at,
          users:created_by_user_id (
            id,
            display_name,
            handle,
            avatar_url
          )
        `
        )
        .eq('task_id', taskId)
        .maybeSingle();

    if (existingShareLinkError) {
      console.error('Error fetching share link:', existingShareLinkError);
      return NextResponse.json(
        { error: 'Failed to fetch share link' },
        { status: 500 }
      );
    }

    if (existingShareLink) {
      return NextResponse.json({ shareLink: existingShareLink });
    }

    // Lazily create the single share link the first time the share dialog is opened.
    // Note: a DB unique constraint on (task_id) enforces one link per task.
    let code = generateShareCode();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const { data: codeCheck } = await supabase
        .from('task_share_links')
        .select('code')
        .eq('code', code)
        .maybeSingle();

      if (!codeCheck) break;

      code = generateShareCode();
      attempts++;
    }

    if (attempts === maxAttempts) {
      return NextResponse.json(
        { error: 'Failed to generate unique code' },
        { status: 500 }
      );
    }

    const { data: shareLink, error: shareLinkError } = await supabase
      .from('task_share_links')
      .insert({
        task_id: taskId,
        code,
        public_access: 'none',
        requires_invite: false,
        created_by_user_id: user.id,
      })
      .select(
        `
        id,
        task_id,
        code,
        public_access,
        requires_invite,
        created_by_user_id,
        created_at,
        users:created_by_user_id (
          id,
          display_name,
          handle,
          avatar_url
        )
      `
      )
      .single();

    if (shareLinkError) {
      console.error('Error creating share link:', shareLinkError);
      return NextResponse.json(
        { error: 'Failed to create share link' },
        { status: 500 }
      );
    }

    return NextResponse.json({ shareLink }, { status: 201 });
  } catch (error) {
    console.error('Error in GET /share-links:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<ShareLinkParams> }
) {
  try {
    const { wsId, taskId } = await params;

    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

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
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Verify task belongs to workspace
    const { data: task } = await supabase
      .from('tasks')
      .select(
        `
        id,
        task_lists!inner (
          id,
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (!task || task.task_lists?.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Task not found in this workspace' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = updateShareLinkSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error },
        { status: 400 }
      );
    }

    // Ensure the single share link exists
    const { data: existingShareLink } = await supabase
      .from('task_share_links')
      .select('id')
      .eq('task_id', taskId)
      .maybeSingle();

    if (!existingShareLink) {
      return NextResponse.json(
        { error: 'Share link not found; fetch it first to create' },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (validationResult.data.publicAccess !== undefined) {
      updatePayload.public_access = validationResult.data.publicAccess;
    }

    if (validationResult.data.requiresInvite !== undefined) {
      updatePayload.requires_invite = validationResult.data.requiresInvite;
      if (validationResult.data.requiresInvite === true) {
        // Enforce invariant at API level too
        updatePayload.public_access = 'none';
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: shareLink, error: shareLinkError } = await supabase
      .from('task_share_links')
      .update(updatePayload)
      .eq('id', existingShareLink.id)
      .select(
        `
        id,
        task_id,
        code,
        public_access,
        requires_invite,
        created_by_user_id,
        created_at,
        users:created_by_user_id (
          id,
          display_name,
          handle,
          avatar_url
        )
      `
      )
      .single();

    if (shareLinkError) {
      console.error('Error updating share link:', shareLinkError);
      return NextResponse.json(
        { error: 'Failed to update share link' },
        { status: 500 }
      );
    }

    return NextResponse.json({ shareLink });
  } catch (error) {
    console.error('Error in PATCH /share-links:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<ShareLinkParams> }
) {
  try {
    const { wsId, taskId } = await params;

    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('id');

    if (!linkId || !validate(linkId)) {
      return NextResponse.json({ error: 'Invalid link ID' }, { status: 400 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Delete share link (RLS will verify task belongs to workspace)
    const { error: deleteError } = await supabase
      .from('task_share_links')
      .delete()
      .eq('id', linkId)
      .eq('task_id', taskId);

    if (deleteError) {
      console.error('Error deleting share link:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete share link' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /share-links:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

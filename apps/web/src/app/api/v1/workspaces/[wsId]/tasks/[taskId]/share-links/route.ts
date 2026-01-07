import crypto from 'node:crypto';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

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
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<ShareLinkParams> }
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    if (!normalizedWsId || !validate(normalizedWsId) || !validate(taskId)) {
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
      .eq('ws_id', normalizedWsId)
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

    if (!task || task.task_lists?.workspace_boards?.ws_id !== normalizedWsId) {
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
    let shareLink = null;
    let attempts = 0;
    const maxAttempts = 10;
    let lastError = null;

    while (attempts < maxAttempts) {
      const code = generateShareCode();
      const { data, error } = await supabase
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

      if (!error) {
        shareLink = data;
        break;
      }

      // Check for unique constraint violation on 'code' (Postgres error 23505)
      // Note: we might also hit unique constraint on task_id if another request beat us to it,
      // but in that case we should probably just fetch and return the existing one.
      // However, the user request specifically asked to retry on 23505 for unique code generation.
      if (error.code === '23505') {
        // Unique violation could be on 'code' OR 'task_id'.
        // Check if a link already exists for this task.
        const { data: existingLink } = await supabase
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

        if (existingLink) {
          shareLink = existingLink;
          break;
        }

        // If no link exists for this task, it must be a code collision. Retry.
        attempts++;
        lastError = error;
        continue;
      }

      // Other errors are fatal
      console.error('Error creating share link:', error);
      return NextResponse.json(
        { error: 'Failed to create share link' },
        { status: 500 }
      );
    }

    if (!shareLink) {
      console.error(
        'Failed to generate unique code after max attempts:',
        lastError
      );
      return NextResponse.json(
        { error: 'Failed to generate unique code' },
        { status: 500 }
      );
    }

    // const { data: shareLink, error: shareLinkError } = await supabase... (REPLACED ABOVE)

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
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    if (!normalizedWsId || !validate(normalizedWsId) || !validate(taskId)) {
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
      .eq('ws_id', normalizedWsId)
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

    if (!task || task.task_lists?.workspace_boards?.ws_id !== normalizedWsId) {
      return NextResponse.json(
        { error: 'Task not found in this workspace' },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
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
      // Public access is restricted to internal workspace only
      if (
        validationResult.data.publicAccess !== 'none' &&
        normalizedWsId !== ROOT_WORKSPACE_ID
      ) {
        return NextResponse.json(
          {
            error:
              'Public access is currently restricted to internal workspace.',
          },
          { status: 403 }
        );
      }
      updatePayload.public_access = validationResult.data.publicAccess;
    }

    if (validationResult.data.requiresInvite !== undefined) {
      if (normalizedWsId !== ROOT_WORKSPACE_ID) {
        return NextResponse.json(
          {
            error:
              'Invite-only tasks are currently restricted to internal workspace.',
          },
          { status: 403 }
        );
      }
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
): Promise<NextResponse> {
  try {
    const { wsId, taskId } = await params;

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    if (!normalizedWsId || !validate(normalizedWsId) || !validate(taskId)) {
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
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Verify task belongs to workspace
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        task_lists!inner (
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .eq('task_lists.workspace_boards.ws_id', normalizedWsId)
      .single();

    if (taskError || !task) {
      if (taskError && taskError.code !== 'PGRST116') {
        console.error('Error verifying task ownership:', taskError);
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Task not found in this workspace' },
        { status: 404 }
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

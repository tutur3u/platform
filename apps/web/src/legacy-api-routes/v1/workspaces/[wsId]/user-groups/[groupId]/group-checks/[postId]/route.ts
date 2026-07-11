import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getExistingPostCheckStates,
  recordPostCheckChanges,
} from '@/lib/post-check-audit';
import { enqueueApprovedPostEmails } from '@/lib/post-email-queue';
import { resolvePostEmailEnqueueAccess } from '@/lib/post-email-queue/enqueue-access';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    postId: string;
  }>;
}

async function resolveActorId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function PUT(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { wsId, groupId, postId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  const canUpdateUserGroupsPosts = !withoutPermission(
    'update_user_groups_posts'
  );
  if (!canUpdateUserGroupsPosts) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group posts' },
      { status: 403 }
    );
  }
  const postEmailEnqueueAccess = await resolvePostEmailEnqueueAccess({
    permissions,
    wsId,
  });

  // Ensure resource belongs to this workspace and group
  const { data: post, error: postErr } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select(`
      id,
      group_id,
      workspace_user_groups!inner(ws_id)
    `)
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (postErr || !post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  // Validate payload
  const SingleSchema = z.object({
    user_id: z.guid(),
    is_completed: z.boolean(),
    notes: z.string().max(MAX_URL_LENGTH).nullable().optional(),
    // created_at is server-managed; do not accept from client
  });
  const MultipleSchema = z.array(SingleSchema);
  const isArray = Array.isArray(data);
  const parse = isArray
    ? MultipleSchema.safeParse(data)
    : SingleSchema.safeParse(data);
  if (!parse.success) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const multiple = isArray;
  const validatedData = parse.data;

  if (multiple) {
    const items = validatedData as Array<{
      user_id: string;
      is_completed: boolean;
      notes?: string | null;
    }>;
    const previousStates = await getExistingPostCheckStates(
      sbAdmin,
      postId,
      items.map((item) => item.user_id)
    );

    const { error } = await sbAdmin
      .schema('private')
      .from('user_group_post_checks')
      .upsert(
        items.map((item) => ({
          post_id: postId,
          user_id: item.user_id,
          notes: item.notes ?? null,
          is_completed: item.is_completed,
        }))
      )
      .eq('post_id', postId);

    if (error) {
      console.error(
        `[PUT /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}] Error upserting multiple user_group_post_checks:`,
        error.message || error,
        `Attempted to update ${Array.isArray(validatedData) ? validatedData.length : 1} records`
      );
      return NextResponse.json(
        {
          message: 'Error updating user_group_post_checks',
          details: error.message || 'Database operation failed',
        },
        { status: 500 }
      );
    }

    await recordPostCheckChanges(sbAdmin, {
      postId,
      changedBy: await resolveActorId(),
      changes: items.map((item) => ({
        user_id: item.user_id,
        previous_is_completed: previousStates.get(item.user_id) ?? null,
        new_is_completed: item.is_completed,
      })),
    });

    if (postEmailEnqueueAccess.allowed) {
      await enqueueApprovedPostEmails(sbAdmin, {
        wsId,
        postId,
        groupId,
        userIds: items.map((item) => item.user_id),
      });
    }

    return NextResponse.json({ message: 'Data updated successfully' });
  } else {
    const singleData = validatedData as {
      user_id: string;
      is_completed: boolean;
      notes?: string | null;
    };
    const previousStates = await getExistingPostCheckStates(sbAdmin, postId, [
      singleData.user_id,
    ]);

    const { error } = await sbAdmin
      .schema('private')
      .from('user_group_post_checks')
      .upsert({
        post_id: postId,
        user_id: singleData.user_id,
        notes: singleData.notes ?? null,
        is_completed: singleData.is_completed,
      })
      .eq('post_id', postId)
      .eq('user_id', singleData.user_id);

    if (error) {
      console.error(
        `[PUT /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}] Error upserting single user_group_post_check:`,
        error.message || error,
        `userId: ${singleData.user_id}, postId: ${postId}`
      );
      return NextResponse.json(
        {
          message: 'Error updating user_group_post_checks',
          details: error.message || 'Database operation failed',
        },
        { status: 500 }
      );
    }

    await recordPostCheckChanges(sbAdmin, {
      postId,
      changedBy: await resolveActorId(),
      changes: [
        {
          user_id: singleData.user_id,
          previous_is_completed: previousStates.get(singleData.user_id) ?? null,
          new_is_completed: singleData.is_completed,
        },
      ],
    });

    if (postEmailEnqueueAccess.allowed) {
      await enqueueApprovedPostEmails(sbAdmin, {
        wsId,
        postId,
        groupId,
        userIds: [singleData.user_id],
      });
    }

    return NextResponse.json({ message: 'Data updated successfully' });
  }
}

/**
 * Clears completion checks back to pending (removes the rows). Accepts a single
 * `user_id` or an array of them, records the transition to `null` in the audit
 * log, and is how the UI undoes an accidental "check all" or reverts an entry.
 */
export async function DELETE(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const data = await req.json().catch(() => null);
  const { wsId, groupId, postId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('update_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group posts' },
      { status: 403 }
    );
  }

  const Schema = z.object({
    user_ids: z.array(z.guid()).min(1),
  });
  const parsed = Schema.safeParse(
    Array.isArray(data?.user_ids) ? data : { user_ids: [data?.user_id] }
  );
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }
  const userIds = parsed.data.user_ids;

  // Ensure the post belongs to this workspace and group.
  const { data: post } = await sbAdmin
    .schema('private')
    .from('user_group_posts')
    .select('id, group_id, workspace_user_groups!inner(ws_id)')
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  const previousStates = await getExistingPostCheckStates(
    sbAdmin,
    postId,
    userIds
  );

  const { error } = await sbAdmin
    .schema('private')
    .from('user_group_post_checks')
    .delete()
    .eq('post_id', postId)
    .in('user_id', userIds);

  if (error) {
    console.error(
      `[DELETE /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}] Error clearing checks:`,
      error.message || error
    );
    return NextResponse.json(
      { message: 'Error clearing user_group_post_checks' },
      { status: 500 }
    );
  }

  await recordPostCheckChanges(sbAdmin, {
    postId,
    changedBy: await resolveActorId(),
    changes: userIds.map((user_id) => ({
      user_id,
      previous_is_completed: previousStates.get(user_id) ?? null,
      new_is_completed: null,
    })),
  });

  return NextResponse.json({ message: 'Checks cleared successfully' });
}

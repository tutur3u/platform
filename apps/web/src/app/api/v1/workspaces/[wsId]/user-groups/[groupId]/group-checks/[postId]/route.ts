import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enqueueApprovedPostEmails } from '@/lib/post-email-queue';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    postId: string;
  }>;
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

  // Ensure resource belongs to this workspace and group
  const { data: post, error: postErr } = await sbAdmin
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
    const { error } = await sbAdmin
      .from('user_group_post_checks')
      .upsert(
        (
          validatedData as Array<{
            user_id: string;
            is_completed: boolean;
            notes?: string | null;
          }>
        ).map((item) => ({
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

    await enqueueApprovedPostEmails(sbAdmin, {
      wsId,
      postId,
      groupId,
      userIds: (
        validatedData as Array<{
          user_id: string;
        }>
      ).map((item) => item.user_id),
    });

    return NextResponse.json({ message: 'Data updated successfully' });
  } else {
    const singleData = validatedData as {
      user_id: string;
      is_completed: boolean;
      notes?: string | null;
    };

    const { error } = await sbAdmin
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

    await enqueueApprovedPostEmails(sbAdmin, {
      wsId,
      postId,
      groupId,
      userIds: [singleData.user_id],
    });

    return NextResponse.json({ message: 'Data updated successfully' });
  }
}

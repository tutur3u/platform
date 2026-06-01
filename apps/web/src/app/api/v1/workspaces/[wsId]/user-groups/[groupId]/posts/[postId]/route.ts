import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { hasUserGroupPostInWorkspace } from '@/lib/user-groups/route-helpers';

interface Params {
  params: Promise<{
    groupId: string;
    postId: string;
    wsId: string;
  }>;
}

const UpdateGroupPostSchema = z
  .object({
    title: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
    content: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
    notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PUT(req: Request, { params }: Params) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = UpdateGroupPostSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: 'Invalid data', errors: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const { groupId, postId, wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('update_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group posts' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient();
  let postExists = false;
  try {
    postExists = await hasUserGroupPostInWorkspace({
      sbAdmin: supabase,
      wsId,
      groupId,
      postId,
    });
  } catch (error) {
    serverLogger.error('Error resolving user group post workspace', {
      error,
      groupId,
      postId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error resolving user group post workspace' },
      { status: 500 }
    );
  }

  if (!postExists) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .schema('private')
    .from('user_group_posts')
    .update(parsedBody.data)
    .eq('id', postId)
    .eq('group_id', groupId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error updating workspace user group post', {
      error,
      groupId,
      postId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error updating workspace user group post' },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { groupId, postId, wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('delete_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete user group posts' },
      { status: 403 }
    );
  }

  const supabase = await createAdminClient();
  let postExists = false;
  try {
    postExists = await hasUserGroupPostInWorkspace({
      sbAdmin: supabase,
      wsId,
      groupId,
      postId,
    });
  } catch (error) {
    serverLogger.error('Error resolving user group post workspace', {
      error,
      groupId,
      postId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error resolving user group post workspace' },
      { status: 500 }
    );
  }

  if (!postExists) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  const { data: deleted, error } = await supabase
    .schema('private')
    .from('user_group_posts')
    .delete()
    .eq('id', postId)
    .eq('group_id', groupId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error deleting workspace user group post', {
      error,
      groupId,
      postId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error deleting workspace user group post' },
      { status: 500 }
    );
  }

  if (!deleted) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}

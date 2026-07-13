import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateUserGroupCache } from '../../../../../lib/user-groups/revalidate';
import { getUserGroupRoutePermissions } from '../../../../../lib/user-groups/route-auth';
import {
  hasUserGroupPostInWorkspace,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ groupId: string; postId: string; wsId: string }>;
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

async function resolveScopedPost(
  req: Request,
  params: Params['params'],
  permission: 'delete_user_groups_posts' | 'update_user_groups_posts'
) {
  const { groupId, postId, wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, req);
  const permissions = await getUserGroupRoutePermissions(wsId, req);

  if (!permissions) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  }
  if (permissions.withoutPermission(permission)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          message: `Insufficient permissions to ${permission.startsWith('delete') ? 'delete' : 'update'} user group posts`,
        },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = await createAdminClient();
  try {
    const exists = await hasUserGroupPostInWorkspace({
      sbAdmin,
      wsId,
      groupId,
      postId,
    });
    if (!exists) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { message: 'Post not found' },
          { status: 404 }
        ),
      };
    }
  } catch (error) {
    console.error('Error resolving user group post workspace', {
      error,
      groupId,
      postId,
      wsId,
    });
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Error resolving user group post workspace' },
        { status: 500 }
      ),
    };
  }

  return { groupId, ok: true as const, postId, sbAdmin, wsId };
}

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

  const scoped = await resolveScopedPost(
    req,
    params,
    'update_user_groups_posts'
  );
  if (!scoped.ok) return scoped.response;

  const { data: updated, error } = await scoped.sbAdmin
    .schema('private')
    .from('user_group_posts')
    .update(parsedBody.data)
    .eq('id', scoped.postId)
    .eq('group_id', scoped.groupId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating workspace user group post', {
      error,
      groupId: scoped.groupId,
      postId: scoped.postId,
      wsId: scoped.wsId,
    });
    return NextResponse.json(
      { message: 'Error updating workspace user group post' },
      { status: 500 }
    );
  }
  if (!updated) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  revalidateUserGroupCache(scoped.groupId);
  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const scoped = await resolveScopedPost(
    req,
    params,
    'delete_user_groups_posts'
  );
  if (!scoped.ok) return scoped.response;

  const { data: deleted, error } = await scoped.sbAdmin
    .schema('private')
    .from('user_group_posts')
    .delete()
    .eq('id', scoped.postId)
    .eq('group_id', scoped.groupId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting workspace user group post', {
      error,
      groupId: scoped.groupId,
      postId: scoped.postId,
      wsId: scoped.wsId,
    });
    return NextResponse.json(
      { message: 'Error deleting workspace user group post' },
      { status: 500 }
    );
  }
  if (!deleted) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  revalidateUserGroupCache(scoped.groupId);
  return NextResponse.json({ message: 'success' });
}

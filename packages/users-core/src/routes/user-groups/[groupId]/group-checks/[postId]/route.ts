import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getExistingPostCheckStates,
  recordPostCheckChanges,
} from '../../../../../lib/post-check-audit';
import { getUserGroupRoutePermissions } from '../../../../../lib/user-groups/route-auth';
import {
  hasUserGroupPostInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ groupId: string; postId: string; wsId: string }>;
}

const CheckSchema = z.object({
  is_completed: z.boolean(),
  notes: z.string().max(MAX_URL_LENGTH).nullable().optional(),
  user_id: z.guid(),
});
const ChecksSchema = z.array(CheckSchema).min(1);
const ClearSchema = z.object({ user_ids: z.array(z.guid()).min(1) });

async function resolveScopedPost(req: Request, params: Params['params']) {
  const { groupId, postId, wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, req);
  const permissions = await getUserGroupRoutePermissions(wsId, req);

  if (!permissions) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  }
  if (permissions.withoutPermission('update_user_groups_posts')) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Insufficient permissions to update user group posts' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = await createAdminClient();
  try {
    const exists = await hasUserGroupPostInWorkspace({
      groupId,
      postId,
      sbAdmin,
      wsId,
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
    console.error('Error resolving group-check post workspace', {
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

  const parsed = Array.isArray(rawBody)
    ? ChecksSchema.safeParse(rawBody)
    : CheckSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const scoped = await resolveScopedPost(req, params);
  if (!scoped.ok) return scoped.response;

  const checks = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const previousStates = await getExistingPostCheckStates(
    scoped.sbAdmin,
    scoped.postId,
    checks.map((check) => check.user_id)
  );
  const { error } = await scoped.sbAdmin
    .schema('private')
    .from('user_group_post_checks')
    .upsert(
      checks.map((check) => ({
        is_completed: check.is_completed,
        notes: check.notes ?? null,
        post_id: scoped.postId,
        user_id: check.user_id,
      })),
      { onConflict: 'post_id,user_id' }
    );

  if (error) {
    console.error('Error updating group checks', {
      error,
      groupId: scoped.groupId,
      postId: scoped.postId,
      wsId: scoped.wsId,
    });
    return NextResponse.json(
      { message: 'Error updating user group post checks' },
      { status: 500 }
    );
  }

  await recordPostCheckChanges(scoped.sbAdmin, {
    changedBy: await resolveRequestActorAuthUid(req),
    changes: checks.map((check) => ({
      new_is_completed: check.is_completed,
      previous_is_completed: previousStates.get(check.user_id) ?? null,
      user_id: check.user_id,
    })),
    postId: scoped.postId,
  });

  return NextResponse.json({ message: 'Data updated successfully' });
}

export async function DELETE(req: Request, { params }: Params) {
  const rawBody = await req.json().catch(() => null);
  const parsed = ClearSchema.safeParse(
    Array.isArray(rawBody?.user_ids)
      ? rawBody
      : { user_ids: [rawBody?.user_id] }
  );
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const scoped = await resolveScopedPost(req, params);
  if (!scoped.ok) return scoped.response;

  const userIds = parsed.data.user_ids;
  const previousStates = await getExistingPostCheckStates(
    scoped.sbAdmin,
    scoped.postId,
    userIds
  );
  const { error } = await scoped.sbAdmin
    .schema('private')
    .from('user_group_post_checks')
    .delete()
    .eq('post_id', scoped.postId)
    .in('user_id', userIds);

  if (error) {
    console.error('Error clearing group checks', {
      error,
      groupId: scoped.groupId,
      postId: scoped.postId,
      wsId: scoped.wsId,
    });
    return NextResponse.json(
      { message: 'Error clearing user group post checks' },
      { status: 500 }
    );
  }

  await recordPostCheckChanges(scoped.sbAdmin, {
    changedBy: await resolveRequestActorAuthUid(req),
    changes: userIds.map((user_id) => ({
      new_is_completed: null,
      previous_is_completed: previousStates.get(user_id) ?? null,
      user_id,
    })),
    postId: scoped.postId,
  });

  return NextResponse.json({ message: 'Checks cleared successfully' });
}

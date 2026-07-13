import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getExistingPostCheckStates,
  recordPostCheckChanges,
} from '../../../../lib/post-check-audit';
import { getUserGroupRoutePermissions } from '../../../../lib/user-groups/route-auth';
import {
  hasUserGroupPostInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ groupId: string; wsId: string }>;
}

const CheckSchema = z.object({
  is_completed: z.boolean(),
  notes: z.string().max(MAX_URL_LENGTH).nullable().optional(),
  post_id: z.guid(),
  user_id: z.guid(),
});
const ChecksSchema = z.array(CheckSchema).min(1);

async function resolveScopedPost(
  req: Request,
  params: Params['params'],
  postId: string,
  permission: 'view_user_groups_posts' | 'update_user_groups_posts'
) {
  const { groupId, wsId: rawWsId } = await params;
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
        { message: 'Insufficient permissions to access user group posts' },
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

export async function GET(req: Request, { params }: Params) {
  const postId = new URL(req.url).searchParams.get('postId');
  if (!postId) {
    return NextResponse.json(
      { message: 'Post ID is required' },
      { status: 400 }
    );
  }

  const scoped = await resolveScopedPost(
    req,
    params,
    postId,
    'view_user_groups_posts'
  );
  if (!scoped.ok) return scoped.response;

  const { data, error } = await scoped.sbAdmin
    .schema('private')
    .from('user_group_post_checks')
    .select(
      'post_id, user_id, is_completed, notes, created_at, email_id, approval_status, approved_at, rejected_at, rejection_reason'
    )
    .eq('post_id', postId);

  if (error) {
    console.error('Error fetching group checks', {
      error,
      groupId: scoped.groupId,
      postId,
      wsId: scoped.wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching group checks' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, { params }: Params) {
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

  const checks = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const postIds = [...new Set(checks.map((check) => check.post_id))];
  if (postIds.length !== 1 || !postIds[0]) {
    return NextResponse.json(
      { message: 'All checks must belong to the same post' },
      { status: 400 }
    );
  }

  const postId = postIds[0];
  const scoped = await resolveScopedPost(
    req,
    params,
    postId,
    'update_user_groups_posts'
  );
  if (!scoped.ok) return scoped.response;

  const previousStates = await getExistingPostCheckStates(
    scoped.sbAdmin,
    postId,
    checks.map((check) => check.user_id)
  );
  const { error } = await scoped.sbAdmin
    .schema('private')
    .from('user_group_post_checks')
    .upsert(checks, { onConflict: 'post_id,user_id' });

  if (error) {
    console.error('Error saving group checks', {
      error,
      groupId: scoped.groupId,
      postId,
      wsId: scoped.wsId,
    });
    return NextResponse.json(
      { message: 'Error saving user group post checks' },
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
    postId,
  });

  return NextResponse.json({ message: 'Data saved successfully' });
}

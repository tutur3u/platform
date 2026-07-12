import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  q: z.string().trim().max(120).default(''),
  virtualUserId: z.guid(),
});

const linkSchema = z.object({
  platformUserId: z.guid(),
  virtualUserId: z.guid(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

async function getAccess(request: Request, rawWsId: string) {
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return {
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    } as const;
  }

  if (
    permissions.withoutPermission('update_users') ||
    permissions.withoutPermission('view_users_public_info')
  ) {
    return {
      response: NextResponse.json(
        { error: 'Insufficient permissions to link user profiles' },
        { status: 403 }
      ),
    } as const;
  }

  return {
    wsId: await resolveUserGroupRouteWorkspaceId(rawWsId, request),
    admin: await createAdminClient({ noCookie: true }),
  } as const;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { wsId: rawWsId } = await params;
    const access = await getAccess(request, rawWsId);
    if ('response' in access) return access.response;

    const { admin, wsId } = access;
    const { q, virtualUserId } = parsed.data;
    const { data: virtualUser } = await admin
      .from('workspace_users')
      .select('id, email')
      .eq('id', virtualUserId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (!virtualUser) {
      return NextResponse.json(
        { error: 'Workspace user not found' },
        { status: 404 }
      );
    }

    const [{ data: memberships, error: membershipError }, { data: links }] =
      await Promise.all([
        admin.from('workspace_members').select('user_id').eq('ws_id', wsId),
        admin
          .from('workspace_user_linked_users')
          .select('platform_user_id, virtual_user_id')
          .eq('ws_id', wsId),
      ]);
    if (membershipError) throw membershipError;

    const memberIds = (memberships ?? [])
      .map((membership) => membership.user_id)
      .filter((id): id is string => Boolean(id));
    if (memberIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const [{ data: users, error: usersError }, { data: privateDetails }] =
      await Promise.all([
        admin
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', memberIds),
        admin
          .from('user_private_details')
          .select('user_id, email')
          .in('user_id', memberIds),
      ]);
    if (usersError) throw usersError;

    const emailByUserId = new Map(
      (privateDetails ?? []).map((details) => [
        details.user_id,
        details.email?.trim().toLowerCase() ?? null,
      ])
    );
    const linkByPlatformUserId = new Map(
      (links ?? []).map((link) => [link.platform_user_id, link.virtual_user_id])
    );
    const targetEmail = virtualUser.email?.trim().toLowerCase() ?? null;
    const normalizedQuery = q.toLowerCase();
    const data = (users ?? [])
      .map((user) => {
        const email = emailByUserId.get(user.id) ?? null;
        return {
          avatarUrl: user.avatar_url,
          displayName: user.display_name,
          email,
          id: user.id,
          isEmailMatch: Boolean(targetEmail && email === targetEmail),
          linkedVirtualUserId: linkByPlatformUserId.get(user.id) ?? null,
        };
      })
      .filter((user) => {
        if (!normalizedQuery) return true;
        return [user.displayName, user.email].some((value) =>
          value?.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort(
        (left, right) =>
          Number(right.isEmailMatch) - Number(left.isEmailMatch) ||
          (left.displayName ?? left.email ?? left.id).localeCompare(
            right.displayName ?? right.email ?? right.id
          )
      )
      .slice(0, 100);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing manual user-link candidates', { error });
    return NextResponse.json(
      { error: 'Failed to load link candidates' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const parsed = linkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { wsId: rawWsId } = await params;
    const access = await getAccess(request, rawWsId);
    if ('response' in access) return access.response;

    const { admin, wsId } = access;
    const { platformUserId, virtualUserId } = parsed.data;
    const [{ data: virtualUser }, { data: member }] = await Promise.all([
      admin
        .from('workspace_users')
        .select('id')
        .eq('id', virtualUserId)
        .eq('ws_id', wsId)
        .maybeSingle(),
      admin
        .from('workspace_members')
        .select('user_id')
        .eq('user_id', platformUserId)
        .eq('ws_id', wsId)
        .maybeSingle(),
    ]);
    if (!virtualUser || !member) {
      return NextResponse.json(
        { error: 'Both profiles must belong to this workspace' },
        { status: 400 }
      );
    }

    const { data: existingLinks, error: existingLinksError } = await admin
      .from('workspace_user_linked_users')
      .select('platform_user_id, virtual_user_id')
      .eq('ws_id', wsId)
      .or(
        `platform_user_id.eq.${platformUserId},virtual_user_id.eq.${virtualUserId}`
      );
    if (existingLinksError) throw existingLinksError;

    const exactLink = existingLinks?.some(
      (link) =>
        link.platform_user_id === platformUserId &&
        link.virtual_user_id === virtualUserId
    );
    if (exactLink) {
      return NextResponse.json({ alreadyLinked: true, success: true });
    }
    if ((existingLinks?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: 'One of these profiles is already linked' },
        { status: 409 }
      );
    }

    const { error } = await admin.from('workspace_user_linked_users').insert({
      platform_user_id: platformUserId,
      virtual_user_id: virtualUserId,
      ws_id: wsId,
    });
    if (error) throw error;

    return NextResponse.json({ alreadyLinked: false, success: true });
  } catch (error) {
    console.error('Error manually linking workspace user profiles', { error });
    return NextResponse.json(
      { error: 'Failed to link user profiles' },
      { status: 500 }
    );
  }
}

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types/db';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';

export type TeachAccessResult =
  | {
      normalizedWsId: string;
      sbAdmin: TypedSupabaseClient;
    }
  | NextResponse;

export async function requireTeachWorkspaceAccess({
  context,
  permission,
  wsId,
}: {
  context: SessionAuthContext;
  permission: PermissionId;
  wsId: string;
}): Promise<TeachAccessResult> {
  const normalizedWsId = await normalizeWorkspaceId(wsId, context.supabase);
  const membership = await verifyWorkspaceMembershipType({
    supabase: context.supabase,
    userId: context.user.id,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const permissions = await getPermissions({
    user: context.user,
    wsId: normalizedWsId,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (permissions.withoutPermission(permission)) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  return {
    normalizedWsId,
    sbAdmin: (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient,
  };
}

export async function validateTeachCourse({
  courseId,
  db,
  wsId,
}: {
  courseId: string;
  db: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await db
    .from('workspace_user_groups')
    .select('id, name, ws_id, is_guest, archived')
    .eq('id', courseId)
    .eq('ws_id', wsId)
    .eq('is_guest', false)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTeachActorWorkspaceUserId({
  db,
  platformUserId,
  wsId,
}: {
  db: TypedSupabaseClient;
  platformUserId: string;
  wsId: string;
}) {
  const { data: existing, error: existingError } = await db
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', platformUserId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.virtual_user_id) return existing.virtual_user_id;

  const { data, error } = await db.rpc('ensure_workspace_user_link', {
    target_user_id: platformUserId,
    target_ws_id: wsId,
  });

  if (error) throw error;
  return data;
}

export async function createRequestSupabase(request: Request) {
  return (await createClient(request)) as TypedSupabaseClient;
}

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { revalidateUserGroupCache } from '@/lib/user-groups/revalidate';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@/lib/user-groups/route-helpers';
import { listUserGroupSessionDates } from '@/lib/user-groups/session-schedule';

const UpdateUserGroupSchema = z
  .object({
    name: z.string().max(MAX_NAME_LENGTH).min(1).optional(),
    is_guest: z.boolean().nullable().optional(),
    starting_date: z.string().datetime().nullable().optional(),
    ending_date: z.string().datetime().nullable().optional(),
    notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
    description: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
    archived: z.boolean().optional(),
    is_course_published: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.starting_date && data.ending_date) {
        return new Date(data.ending_date) >= new Date(data.starting_date);
      }
      return true;
    },
    {
      message: 'End date must be after or equal to start date',
      path: ['ending_date'],
    }
  );

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_user_groups')
    .select('id, name, starting_date, ending_date')
    .eq('ws_id', normalizedWsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Error fetching workspace user group:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace user group' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Workspace user group not found' },
      { status: 404 }
    );
  }

  const sessions = await listUserGroupSessionDates({
    groupId,
    supabase: sbAdmin,
    wsId: normalizedWsId,
  });

  return NextResponse.json({ data: { ...data, sessions } });
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user groups' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'sessions' in body
  ) {
    return NextResponse.json(
      {
        message:
          'Legacy sessions payloads are no longer accepted. Use the user group sessions API.',
      },
      { status: 400 }
    );
  }

  const data = UpdateUserGroupSchema.safeParse(body);

  if (!data.success) {
    return NextResponse.json(
      { message: 'Invalid data', errors: data.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { data: updatedGroup, error } = await sbAdmin
    .schema('private')
    .rpc('admin_update_workspace_user_group_with_audit_actor', {
      p_ws_id: normalizedWsId,
      p_group_id: groupId,
      p_payload: data.data,
      p_actor_auth_uid: actorAuthUid ?? undefined,
    });

  if (error) {
    serverLogger.error('Error updating workspace user group:', error);
    return NextResponse.json(
      { message: 'Error updating workspace user group' },
      { status: 500 }
    );
  }

  if (!updatedGroup) {
    return NextResponse.json(
      { message: 'Workspace user group not found' },
      { status: 404 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('delete_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { data: deletedGroup, error } = await sbAdmin
    .schema('private')
    .rpc('admin_delete_workspace_user_group_with_audit_actor', {
      p_ws_id: normalizedWsId,
      p_group_id: groupId,
      p_actor_auth_uid: actorAuthUid ?? undefined,
    });

  if (error) {
    serverLogger.error('Error deleting workspace user group:', error);
    return NextResponse.json(
      { message: 'Error deleting workspace user group' },
      { status: 500 }
    );
  }

  if (!deletedGroup) {
    return NextResponse.json(
      { message: 'Workspace user group not found' },
      { status: 404 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}

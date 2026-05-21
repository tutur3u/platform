import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  hasUserGroupInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@/lib/user-groups/route-helpers';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

const AttendanceSchema = z.object({
  user_id: z.guid(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'NONE']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

const BatchAttendanceSchema = z.array(AttendanceSchema);

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  if (!z.guid().safeParse(groupId).success) {
    return NextResponse.json({ message: 'Invalid groupId' }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ message: 'Date is required' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  if (
    !(await hasUserGroupInWorkspace({
      sbAdmin,
      wsId: normalizedWsId,
      groupId,
    }))
  ) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  const { data, error } = await sbAdmin
    .from('user_group_attendance')
    .select('user_id, status, notes')
    .eq('group_id', groupId)
    .eq('date', date);

  if (error) {
    serverLogger.error('Error fetching group attendance:', error);
    return NextResponse.json(
      { message: 'Error fetching attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  if (!z.guid().safeParse(groupId).success) {
    return NextResponse.json({ message: 'Invalid groupId' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('check_user_attendance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update attendance' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = BatchAttendanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const date = payload[0]?.date;

  if (!date) {
    return NextResponse.json({ message: 'Date is required' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { error } = await sbAdmin
    .schema('private')
    .rpc('admin_save_user_group_attendance_with_audit_actor', {
      p_actor_auth_uid: actorAuthUid ?? undefined,
      p_date: date,
      p_group_id: groupId,
      p_payload: payload,
      p_ws_id: normalizedWsId,
    });

  if (error) {
    serverLogger.error('Error saving group attendance:', error);
    return NextResponse.json(
      { message: 'Error saving attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

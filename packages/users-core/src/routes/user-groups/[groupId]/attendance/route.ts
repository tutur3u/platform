import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  hasUserGroupInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

const AttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  session_id: z.guid().nullable().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'NONE']),
  user_id: z.guid(),
});

const BatchAttendanceSchema = z.array(AttendanceSchema);

type PrivateSessionRow = {
  id: string;
  starts_at: string;
  start_timezone: string;
};

type AttendanceResponseRow = {
  id: string;
  user_id: string;
  status: string;
  notes: string | null;
  session_id: string | null;
};

type UntypedSchemaClient = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: any }>;
};

function privateSchema(sbAdmin: TypedSupabaseClient): UntypedSchemaClient {
  return (sbAdmin as any).schema('private') as UntypedSchemaClient;
}

async function validateSessionIds({
  date,
  groupId,
  sbAdmin,
  sessionIds,
  wsId,
}: {
  date: string;
  groupId: string;
  sbAdmin: TypedSupabaseClient;
  sessionIds: string[];
  wsId: string;
}) {
  const uniqueSessionIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (uniqueSessionIds.length === 0) return true;

  const { data, error } = (await privateSchema(sbAdmin)
    .from('workspace_user_group_sessions')
    .select('id, starts_at, start_timezone')
    .eq('ws_id', wsId)
    .eq('group_id', groupId)
    .eq('status', 'scheduled')
    .in('id', uniqueSessionIds)) as {
    data: PrivateSessionRow[] | null;
    error: unknown;
  };

  if (error) throw error;

  const validIds = new Set(
    (data ?? [])
      .filter((session) => {
        const localDate = new Date(session.starts_at).toLocaleDateString(
          'en-CA',
          { timeZone: session.start_timezone }
        );
        return localDate === date;
      })
      .map((session) => session.id)
  );

  return uniqueSessionIds.every((sessionId) => validIds.has(sessionId));
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  if (!z.guid().safeParse(groupId).success) {
    return NextResponse.json({ message: 'Invalid groupId' }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const sessionId = searchParams.get('sessionId');

  if (!date) {
    return NextResponse.json({ message: 'Date is required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ message: 'Invalid date' }, { status: 400 });
  }
  if (sessionId && !z.guid().safeParse(sessionId).success) {
    return NextResponse.json({ message: 'Invalid sessionId' }, { status: 400 });
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

  if (sessionId) {
    try {
      const validSession = await validateSessionIds({
        date,
        groupId,
        sbAdmin,
        sessionIds: [sessionId],
        wsId: normalizedWsId,
      });

      if (!validSession) {
        return NextResponse.json(
          { message: 'User group session not found' },
          { status: 404 }
        );
      }
    } catch (error) {
      console.error('Error validating group attendance session:', error);
      return NextResponse.json(
        { message: 'Error fetching attendance' },
        { status: 500 }
      );
    }
  }

  let attendanceQuery = sbAdmin
    .from('user_group_attendance')
    .select('id, user_id, status, notes, session_id')
    .eq('group_id', groupId)
    .eq('date', date);

  if (sessionId) {
    attendanceQuery = attendanceQuery.or(
      `session_id.eq.${sessionId},session_id.is.null`
    );
  } else {
    attendanceQuery = attendanceQuery.is('session_id', null);
  }

  const { data, error } = (await attendanceQuery) as unknown as {
    data: AttendanceResponseRow[] | null;
    error: unknown;
  };

  if (error) {
    console.error('Error fetching group attendance:', error);
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
  const sessionIds = payload
    .map((entry) => entry.session_id)
    .filter((sessionId): sessionId is string => Boolean(sessionId));

  try {
    const validSessions = await validateSessionIds({
      date,
      groupId,
      sbAdmin,
      sessionIds,
      wsId: normalizedWsId,
    });

    if (!validSessions) {
      return NextResponse.json(
        { message: 'Invalid attendance session' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error validating group attendance session:', error);
    return NextResponse.json(
      { message: 'Error saving attendance' },
      { status: 500 }
    );
  }

  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { error } = await privateSchema(sbAdmin).rpc(
    'admin_save_user_group_attendance_with_audit_actor',
    {
      p_actor_auth_uid: actorAuthUid ?? undefined,
      p_date: date,
      p_group_id: groupId,
      p_payload: payload,
      p_ws_id: normalizedWsId,
    }
  );

  if (error) {
    console.error('Error saving group attendance:', error);
    return NextResponse.json(
      { message: 'Error saving attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

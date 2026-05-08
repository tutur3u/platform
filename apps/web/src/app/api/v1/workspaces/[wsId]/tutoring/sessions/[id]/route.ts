import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TablesUpdate } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { TutoringSessionUpdateSchema } from '../../shared';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

async function isGroupTeacher(
  wsId: string,
  groupId: string,
  teacherUserId: string,
  sbAdmin: TypedSupabaseClient
) {
  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('user_id,user:workspace_users!inner(ws_id)')
    .eq('group_id', groupId)
    .eq('user_id', teacherUserId)
    .eq('role', 'TEACHER')
    .eq('user.ws_id', wsId)
    .maybeSingle();

  if (error) {
    return { isValid: false, error };
  }

  return { isValid: Boolean(data), error: null };
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = TutoringSessionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const updates: TablesUpdate<'workspace_tutoring_sessions'> = {};
  if (parsed.data.teacherUserId !== undefined)
    updates.teacher_user_id = parsed.data.teacherUserId;
  if (parsed.data.sessionDate !== undefined)
    updates.session_date = parsed.data.sessionDate;
  if (parsed.data.startTime !== undefined)
    updates.start_time = parsed.data.startTime;
  if (parsed.data.durationMinutes !== undefined)
    updates.duration_minutes = parsed.data.durationMinutes;
  if (parsed.data.reasonType !== undefined)
    updates.reason_type = parsed.data.reasonType;
  if (parsed.data.reasonDetail !== undefined)
    updates.reason_detail = parsed.data.reasonDetail;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.attendanceStatus !== undefined)
    updates.attendance_status = parsed.data.attendanceStatus;
  if (parsed.data.parentMessagePreview !== undefined)
    updates.parent_message_preview = parsed.data.parentMessagePreview;
  if (parsed.data.resolvedAt !== undefined)
    updates.resolved_at = parsed.data.resolvedAt;

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;

  if (parsed.data.teacherUserId) {
    const { data: session, error: sessionError } = await sbAdmin
      .from('workspace_tutoring_sessions')
      .select('group_id')
      .eq('id', id)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (sessionError) {
      serverLogger.error('Failed to load tutoring session for teacher update', {
        error: sessionError,
        sessionId: id,
        wsId,
      });

      return NextResponse.json(
        { message: 'Failed to validate teacher assignment' },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { message: 'Session not found' },
        { status: 404 }
      );
    }

    const teacherCheck = await isGroupTeacher(
      wsId,
      session.group_id,
      parsed.data.teacherUserId,
      sbAdmin
    );

    if (teacherCheck.error) {
      serverLogger.error('Failed to validate tutoring teacher assignment', {
        error: teacherCheck.error,
        sessionId: id,
        teacherUserId: parsed.data.teacherUserId,
        wsId,
      });

      return NextResponse.json(
        { message: 'Failed to validate teacher assignment' },
        { status: 500 }
      );
    }

    if (!teacherCheck.isValid) {
      return NextResponse.json(
        { message: 'Teacher must be a manager of the selected group' },
        { status: 400 }
      );
    }
  }

  const { data, error } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .update(updates)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to update tutoring session', error);
    return NextResponse.json(
      { message: 'Failed to update session' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}

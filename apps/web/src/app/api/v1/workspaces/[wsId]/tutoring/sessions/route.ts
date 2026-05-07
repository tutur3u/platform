import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  TutoringSessionCreateSchema,
  TutoringSessionListQuerySchema,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = TutoringSessionListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { page, pageSize } = parsed.data;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sbAdmin
    .from('workspace_tutoring_sessions')
    .select(
      `
        id,
        ws_id,
        group_id,
        student_user_id,
        teacher_user_id,
        session_date,
        start_time,
        duration_minutes,
        reason_type,
        reason_detail,
        content,
        attendance_status,
        parent_message_preview,
        source_feedback_id,
        resolved_at,
        created_by,
        created_at,
        updated_at,
        group:workspace_user_groups!workspace_tutoring_sessions_group_id_fkey(id,name),
        student:workspace_users!workspace_tutoring_sessions_student_user_id_fkey(id,full_name,display_name,email),
        teacher:workspace_users!workspace_tutoring_sessions_teacher_user_id_fkey(id,full_name,display_name,email)
      `,
      { count: 'exact' }
    )
    .eq('ws_id', wsId);

  if (parsed.data.fromDate)
    query = query.gte('session_date', parsed.data.fromDate);
  if (parsed.data.toDate) query = query.lte('session_date', parsed.data.toDate);
  if (parsed.data.teacherId)
    query = query.eq('teacher_user_id', parsed.data.teacherId);
  if (parsed.data.groupId) query = query.eq('group_id', parsed.data.groupId);
  if (parsed.data.studentUserId)
    query = query.eq('student_user_id', parsed.data.studentUserId);
  if (parsed.data.reasonType)
    query = query.eq('reason_type', parsed.data.reasonType);
  if (parsed.data.attendanceStatus)
    query = query.eq('attendance_status', parsed.data.attendanceStatus);

  const { data, error, count } = await query
    .order('session_date', { ascending: false })
    .order('start_time', { ascending: false })
    .range(from, to);

  if (error) {
    serverLogger.error('Failed to list tutoring sessions', error);
    return NextResponse.json(
      { message: 'Failed to list sessions' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data ?? [],
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
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

  const parsed = TutoringSessionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const payload = parsed.data;
  const sessionSlots =
    payload.sessions && payload.sessions.length > 0
      ? payload.sessions
      : payload.sessionDate && payload.startTime
        ? Array.from({ length: payload.sessionCount }, () => ({
            sessionDate: payload.sessionDate as string,
            startTime: payload.startTime as string,
            durationMinutes: payload.durationMinutes,
          }))
        : null;

  if (!sessionSlots) {
    return NextResponse.json(
      {
        message:
          'Invalid request: provide sessions[] or sessionDate/startTime fields',
      },
      { status: 400 }
    );
  }

  const rows = sessionSlots.map((slot) => ({
    ws_id: wsId,
    group_id: payload.groupId,
    student_user_id: payload.studentUserId,
    teacher_user_id: payload.teacherUserId ?? null,
    session_date: slot.sessionDate,
    start_time: slot.startTime,
    duration_minutes: slot.durationMinutes,
    reason_type: payload.reasonType,
    reason_detail: payload.reasonDetail,
    content: payload.content,
    attendance_status: payload.attendanceStatus,
    source_feedback_id: payload.sourceFeedbackId ?? null,
    created_by: user.id,
  }));

  const { data, error } = await sbAdmin
    .from('workspace_tutoring_sessions')
    .insert(rows)
    .select('id');

  if (error) {
    serverLogger.error('Failed to create tutoring session', error);
    return NextResponse.json(
      { message: 'Failed to create session' },
      { status: 500 }
    );
  }

  const ids = (data ?? []).map((row) => row.id);

  return NextResponse.json({
    id: ids[0] ?? null,
    ids,
    createdCount: ids.length,
  });
}

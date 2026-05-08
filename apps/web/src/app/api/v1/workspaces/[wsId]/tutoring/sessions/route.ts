import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  findConflictsWithExistingSessions,
  findConflictsWithinSlots,
  TutoringSessionCreateSchema,
  TutoringSessionListQuerySchema,
  type TutoringSessionSlotInput,
} from '../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

async function listGroupTeacherIds(
  wsId: string,
  groupId: string,
  teacherUserIds: string[],
  sbAdmin: TypedSupabaseClient
) {
  if (teacherUserIds.length === 0) {
    return { teacherIds: new Set<string>(), error: null };
  }

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('user_id,user:workspace_users!inner(ws_id)')
    .eq('group_id', groupId)
    .in('user_id', teacherUserIds)
    .eq('role', 'TEACHER')
    .eq('user.ws_id', wsId);

  if (error) {
    return { teacherIds: new Set<string>(), error };
  }

  return {
    teacherIds: new Set((data ?? []).map((row) => row.user_id).filter(Boolean)),
    error: null,
  };
}

async function listPotentialSchedulingConflicts(
  wsId: string,
  slots: TutoringSessionSlotInput[],
  sbAdmin: TypedSupabaseClient
) {
  const sessionDates = [...new Set(slots.map((slot) => slot.sessionDate))];
  const teacherIds = [
    ...new Set(
      slots
        .map((slot) => slot.teacherUserId)
        .filter((teacherUserId): teacherUserId is string =>
          Boolean(teacherUserId)
        )
    ),
  ];
  const studentIds = [...new Set(slots.map((slot) => slot.studentUserId))];

  if (sessionDates.length === 0) {
    return { data: [], error: null };
  }

  const teacherQuery =
    teacherIds.length > 0
      ? sbAdmin
          .from('workspace_tutoring_sessions')
          .select(
            'id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id'
          )
          .eq('ws_id', wsId)
          .in('session_date', sessionDates)
          .in('teacher_user_id', teacherIds)
      : Promise.resolve({ data: [], error: null });

  const studentQuery = sbAdmin
    .from('workspace_tutoring_sessions')
    .select(
      'id,session_date,start_time,duration_minutes,teacher_user_id,student_user_id'
    )
    .eq('ws_id', wsId)
    .in('session_date', sessionDates)
    .in('student_user_id', studentIds);

  const [teacherResult, studentResult] = await Promise.all([
    teacherQuery,
    studentQuery,
  ]);

  if (teacherResult.error) {
    return { data: [], error: teacherResult.error };
  }

  if (studentResult.error) {
    return { data: [], error: studentResult.error };
  }

  const merged = new Map<string, (typeof studentResult.data)[number]>();
  for (const row of teacherResult.data ?? []) {
    merged.set(row.id, row);
  }
  for (const row of studentResult.data ?? []) {
    merged.set(row.id, row);
  }

  return {
    data: [...merged.values()],
    error: null,
  };
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

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
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
            teacherUserId: payload.teacherUserId ?? null,
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

  const teacherIdsToValidate = [
    ...new Set(
      sessionSlots
        .map((slot) => slot.teacherUserId)
        .filter((teacherUserId): teacherUserId is string =>
          Boolean(teacherUserId)
        )
    ),
  ];

  if (teacherIdsToValidate.length > 0) {
    const teacherCheck = await listGroupTeacherIds(
      wsId,
      payload.groupId,
      teacherIdsToValidate,
      sbAdmin
    );

    if (teacherCheck.error) {
      serverLogger.error('Failed to validate tutoring teacher assignment', {
        error: teacherCheck.error,
        groupId: payload.groupId,
        teacherUserId: payload.teacherUserId,
        wsId,
      });

      return NextResponse.json(
        { message: 'Failed to validate teacher assignment' },
        { status: 500 }
      );
    }

    const allTeachersValid = teacherIdsToValidate.every((teacherUserId) =>
      teacherCheck.teacherIds.has(teacherUserId)
    );

    if (!allTeachersValid) {
      return NextResponse.json(
        { message: 'Teacher must be a manager of the selected group' },
        { status: 400 }
      );
    }
  }

  const slotsForConflictCheck: TutoringSessionSlotInput[] = sessionSlots.map(
    (slot) => ({
      durationMinutes: slot.durationMinutes,
      sessionDate: slot.sessionDate,
      startTime: slot.startTime,
      studentUserId: payload.studentUserId,
      teacherUserId: slot.teacherUserId ?? payload.teacherUserId ?? null,
    })
  );

  const internalConflicts = findConflictsWithinSlots(slotsForConflictCheck);
  if (internalConflicts.length > 0) {
    return NextResponse.json(
      {
        message: 'Scheduling conflict detected in the submitted sessions',
        code: 'SCHEDULING_CONFLICT',
        conflicts: internalConflicts,
      },
      { status: 409 }
    );
  }

  const potentialConflicts = await listPotentialSchedulingConflicts(
    wsId,
    slotsForConflictCheck,
    sbAdmin
  );

  if (potentialConflicts.error) {
    serverLogger.error('Failed to validate tutoring session conflicts', {
      error: potentialConflicts.error,
      groupId: payload.groupId,
      studentUserId: payload.studentUserId,
      wsId,
    });

    return NextResponse.json(
      { message: 'Failed to validate scheduling conflicts' },
      { status: 500 }
    );
  }

  const existingConflicts = findConflictsWithExistingSessions(
    slotsForConflictCheck,
    potentialConflicts.data
  );

  if (existingConflicts.length > 0) {
    return NextResponse.json(
      {
        message: 'Scheduling conflict detected with existing sessions',
        code: 'SCHEDULING_CONFLICT',
        conflicts: existingConflicts,
      },
      { status: 409 }
    );
  }

  const rows = sessionSlots.map((slot) => ({
    ws_id: wsId,
    group_id: payload.groupId,
    student_user_id: payload.studentUserId,
    teacher_user_id: slot.teacherUserId ?? payload.teacherUserId ?? null,
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

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  findConflictsWithExistingSessions,
  findConflictsWithinSlots,
  TutoringSessionCreateSchema,
  TutoringSessionListQuerySchema,
  type TutoringSessionSlotInput,
} from '../shared';
import {
  buildTutoringSessionSlots,
  listGroupTeacherIds,
  listPotentialSchedulingConflicts,
  validateTutoringSessionScope,
} from './session-create-helpers';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const supabase = await createClient(request);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request,
  });

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
  const tutoringSessionsClient = sbAdmin.schema('private');
  const { page, pageSize } = parsed.data;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = tutoringSessionsClient
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
        updated_at
      `,
      { count: 'exact' }
    )
    .eq('ws_id', normalizedWsId);

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
    console.error('Failed to list tutoring sessions', error);
    return NextResponse.json(
      { message: 'Failed to list sessions' },
      { status: 500 }
    );
  }

  const sessions = data ?? [];
  const groupIds = [
    ...new Set(sessions.map((session) => session.group_id).filter(Boolean)),
  ];
  const userIds = [
    ...new Set(
      sessions
        .flatMap((session) => [
          session.student_user_id,
          session.teacher_user_id,
        ])
        .filter((userId): userId is string => Boolean(userId))
    ),
  ];

  const [groupsResult, usersResult] = await Promise.all([
    groupIds.length > 0
      ? sbAdmin
          .from('workspace_user_groups')
          .select('id,name')
          .in('id', groupIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? sbAdmin
          .from('workspace_users')
          .select('id,full_name,display_name,email')
          .in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (groupsResult.error || usersResult.error) {
    console.error('Failed to load tutoring session relations', {
      error: groupsResult.error ?? usersResult.error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to list sessions' },
      { status: 500 }
    );
  }

  const groupMap = new Map(
    (groupsResult.data ?? []).map((group) => [group.id, group])
  );
  const userMap = new Map(
    (usersResult.data ?? []).map((user) => [user.id, user])
  );

  return NextResponse.json({
    data: sessions.map((session) => ({
      ...session,
      group: session.group_id ? (groupMap.get(session.group_id) ?? null) : null,
      student: session.student_user_id
        ? (userMap.get(session.student_user_id) ?? null)
        : null,
      teacher: session.teacher_user_id
        ? (userMap.get(session.teacher_user_id) ?? null)
        : null,
    })),
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const supabase = await createClient(request);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request,
  });

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

  const sbAdmin = await createAdminClient();
  const tutoringSessionsClient = sbAdmin.schema('private');
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const payload = parsed.data;
  const scopeValidationResponse = await validateTutoringSessionScope({
    normalizedWsId,
    payload,
    supabase,
  });
  if (scopeValidationResponse) {
    return scopeValidationResponse;
  }

  const sessionSlots = buildTutoringSessionSlots(payload);

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
    const teacherCheck = await listGroupTeacherIds({
      groupId: payload.groupId,
      normalizedWsId,
      sbAdmin,
      teacherUserIds: teacherIdsToValidate,
    });

    if (teacherCheck.error) {
      console.error('Failed to validate tutoring teacher assignment', {
        error: teacherCheck.error,
        groupId: payload.groupId,
        teacherUserId: payload.teacherUserId,
        wsId: normalizedWsId,
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

  const potentialConflicts = await listPotentialSchedulingConflicts({
    normalizedWsId,
    sbAdmin,
    slots: slotsForConflictCheck,
  });

  if (potentialConflicts.error) {
    console.error('Failed to validate tutoring session conflicts', {
      error: potentialConflicts.error,
      groupId: payload.groupId,
      studentUserId: payload.studentUserId,
      wsId: normalizedWsId,
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
    ws_id: normalizedWsId,
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

  const { data, error } = await tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .insert(rows)
    .select('id');

  if (error) {
    console.error('Failed to create tutoring session', error);
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

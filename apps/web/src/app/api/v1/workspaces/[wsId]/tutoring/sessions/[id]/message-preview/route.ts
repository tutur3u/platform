import {
  getTutoringCampus,
  readTutoringPolicyConfigRows,
  renderTutoringParentMessage,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  formatTutoringDate,
  formatTutoringTimeRange,
  getTutoringWeekdayLabel,
  selectTutoringClassTime,
  TUTORING_VALUE_UNKNOWN,
  type TutoringClassTimeSession,
} from '@tuturuuu/utils/tutoring-message-values';
import { NextResponse } from 'next/server';
import { resolveTutoringReadScope } from '@/lib/tutoring/read-scope';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';

interface Params {
  params: Promise<{ wsId: string; id: string }>;
}

function displayName(
  value: {
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null
) {
  if (!value) return 'N/A';
  return (
    value.full_name?.trim() ||
    value.display_name?.trim() ||
    value.email?.trim() ||
    'N/A'
  );
}

/** Class sessions in the window that can hold the tutoring day or follow it. */
const CLASS_TIME_LOOKUP_LIMIT = 60;

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function POST(request: Request, { params }: Params) {
  const { wsId, id } = await params;
  const access = await resolveTutoringRouteAccess(request, wsId);
  const { normalizedWsId, permissions } = access;

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const scope = await resolveTutoringReadScope({ request, access, sbAdmin });
  if (!scope.allowed)
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const tutoringSessionsClient = sbAdmin.schema('private');
  let sessionQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .select(
      `
      id,
      reason_type,
      session_date,
      start_time,
      duration_minutes,
      group_id,
      student_user_id,
      teacher_user_id
    `
    )
    .eq('id', id)
    .eq('ws_id', normalizedWsId);
  if (scope.teacherId)
    sessionQuery = sessionQuery.eq('teacher_user_id', scope.teacherId);
  const { data, error } = await sessionQuery.maybeSingle();

  if (error) {
    console.error('Failed to load tutoring session for preview', error);
    return NextResponse.json(
      { message: 'Failed to load session' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  const reasonLabel =
    data.reason_type === 'ABSENT_RECOVERY'
      ? 'bù buổi vắng'
      : data.reason_type === 'WEAK_SUPPORT'
        ? 'hỗ trợ học lực'
        : 'phụ đạo';

  const [groupResult, studentResult, teacherResult, policyResult] =
    await Promise.all([
      sbAdmin
        .from('workspace_user_groups')
        .select('name')
        .eq('id', data.group_id)
        .maybeSingle(),
      sbAdmin
        .from('workspace_users')
        .select('full_name,display_name,email')
        .eq('id', data.student_user_id)
        .maybeSingle(),
      data.teacher_user_id
        ? sbAdmin
            .from('workspace_users')
            .select('full_name,display_name,email')
            .eq('id', data.teacher_user_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      sbAdmin
        .from('workspace_configs')
        .select('id,value')
        .eq('ws_id', normalizedWsId)
        .like('id', `${TUTORING_POLICY_CONFIG_ID}%`),
    ]);

  if (
    groupResult.error ||
    studentResult.error ||
    teacherResult.error ||
    policyResult.error
  ) {
    console.error('Failed to load tutoring preview relations', {
      error:
        groupResult.error ??
        studentResult.error ??
        teacherResult.error ??
        policyResult.error,
      sessionId: id,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to load session' },
      { status: 500 }
    );
  }

  const student = studentResult.data;
  const teacher = teacherResult.data;
  const group = groupResult.data;
  const studentName = displayName(student);

  const policy = readTutoringPolicyConfigRows(policyResult.data ?? []);
  // The class time is optional context: a failed read or a template without
  // the field must not stop the preview.
  let classTime = TUTORING_VALUE_UNKNOWN;
  if (policy.parentMessageTemplate.includes('{{class_time}}')) {
    // Widen by a day for time zone offsets; the zoned local date decides.
    const classSessionsResult = await tutoringSessionsClient
      .from('workspace_user_group_sessions')
      .select('status,starts_at,start_timezone,ends_at,end_timezone')
      .eq('ws_id', normalizedWsId)
      .eq('group_id', data.group_id)
      .eq('status', 'scheduled')
      .gte('starts_at', shiftIsoDate(data.session_date, -1))
      .order('starts_at', { ascending: true })
      .limit(CLASS_TIME_LOOKUP_LIMIT);
    if (classSessionsResult.error) {
      console.error('Failed to load class sessions for tutoring preview', {
        error: classSessionsResult.error,
        sessionId: id,
        wsId: normalizedWsId,
      });
    } else {
      const classSessions: TutoringClassTimeSession[] = (
        classSessionsResult.data ?? []
      ).map((row) => ({
        endTimezone: row.end_timezone,
        endsAt: row.ends_at,
        startTimezone: row.start_timezone,
        startsAt: row.starts_at,
        status: row.status,
      }));
      classTime = selectTutoringClassTime(
        classSessions,
        data.session_date,
        String(data.start_time)
      );
    }
  }
  const preview = renderTutoringParentMessage(policy.parentMessageTemplate, {
    campus:
      getTutoringCampus(policy, data.group_id, group?.name) ?? 'Chưa xác định',
    class_time: classTime,
    date: formatTutoringDate(data.session_date),
    duration: String(data.duration_minutes),
    group: group?.name ?? 'N/A',
    reason: reasonLabel,
    student: studentName,
    teacher: displayName(teacher),
    time: String(data.start_time).slice(0, 5),
    time_range: formatTutoringTimeRange(
      String(data.start_time),
      data.duration_minutes
    ),
    weekday: getTutoringWeekdayLabel(data.session_date),
  });

  let updateQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .update({ parent_message_preview: preview })
    .eq('id', id)
    .eq('ws_id', normalizedWsId);
  if (scope.teacherId)
    updateQuery = updateQuery.eq('teacher_user_id', scope.teacherId);
  const { data: updated, error: updateError } = await updateQuery
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('Failed to save tutoring message preview', updateError);
    return NextResponse.json(
      { message: 'Failed to save message preview' },
      { status: 500 }
    );
  }

  if (!updated)
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  return NextResponse.json({ preview });
}

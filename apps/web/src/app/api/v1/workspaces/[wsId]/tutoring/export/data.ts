import { calculateTutoringPayroll } from '@tuturuuu/internal-api/tutoring';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTutoringReadScope } from '@/lib/tutoring/read-scope';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';
import { readAllRows, readByIds } from '../queue/all-rows';

const QuerySchema = z
  .object({
    attendanceStatus: z
      .enum(['PENDING', 'DONE', 'NO_SHOW', 'CANCELLED'])
      .optional(),
    fromDate: z.string().date(),
    groupId: z.string().uuid().optional(),
    toDate: z.string().date(),
    mode: z.enum(['detailed', 'payroll', 'report']).default('detailed'),
    reasonType: z
      .enum(['ABSENT_RECOVERY', 'WEAK_SUPPORT', 'CUSTOM'])
      .optional(),
    studentUserId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      value.fromDate <= value.toDate &&
      (Date.parse(value.toDate) - Date.parse(value.fromDate)) / 86_400_000 +
        1 <=
        366,
    { message: 'Invalid date range' }
  );

interface Params {
  params: Promise<{ wsId: string }>;
}

function nameOf(
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

export async function getTutoringData(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTutoringRouteAccess(request, wsId);
  const { normalizedWsId, permissions } = access;

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (
    permissions.withoutPermission('view_user_groups') &&
    permissions.withoutPermission('view_payroll')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  if (
    parsed.data.mode === 'detailed' &&
    permissions.withoutPermission('view_user_groups')
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const sbAdmin = await createAdminClient();
  const scope = await resolveTutoringReadScope({
    request,
    access,
    sbAdmin,
    teacherId: parsed.data.teacherId,
  });
  if (!scope.allowed)
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  parsed.data.teacherId = scope.teacherId;
  const tutoringSessionsClient = sbAdmin.schema('private');
  // Sessions sharing a date and start time tie, so `id` keeps pages stable.
  const sessions = await readAllRows<
    Pick<
      Tables<{ schema: 'private' }, 'workspace_tutoring_sessions'>,
      | 'id'
      | 'group_id'
      | 'student_user_id'
      | 'teacher_user_id'
      | 'session_date'
      | 'start_time'
      | 'duration_minutes'
      | 'reason_type'
      | 'content'
      | 'attendance_status'
    >
  >((from, to) => {
    let query = tutoringSessionsClient
      .from('workspace_tutoring_sessions')
      .select(
        `
      id,
      group_id,
      student_user_id,
      teacher_user_id,
      session_date,
      start_time,
      duration_minutes,
      reason_type,
      content,
      attendance_status
    `
      )
      .eq('ws_id', normalizedWsId)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
      .order('id', { ascending: true });

    if (parsed.data.fromDate)
      query = query.gte('session_date', parsed.data.fromDate);
    if (parsed.data.toDate)
      query = query.lte('session_date', parsed.data.toDate);
    if (parsed.data.teacherId)
      query = query.eq('teacher_user_id', parsed.data.teacherId);
    if (parsed.data.groupId) query = query.eq('group_id', parsed.data.groupId);
    if (parsed.data.studentUserId)
      query = query.eq('student_user_id', parsed.data.studentUserId);
    if (parsed.data.reasonType)
      query = query.eq('reason_type', parsed.data.reasonType);
    if (parsed.data.attendanceStatus)
      query = query.eq('attendance_status', parsed.data.attendanceStatus);
    return query.range(from, to);
  });
  if (sessions.error) {
    console.error('Failed to export tutoring sessions', sessions.error);
    return NextResponse.json({ message: 'Export failed' }, { status: 500 });
  }
  const data = sessions.data;

  const groupIds = [
    ...new Set(data.map((row) => row.group_id).filter(Boolean)),
  ];
  const userIds = [
    ...new Set(
      data
        .flatMap((row) => [row.student_user_id, row.teacher_user_id])
        .filter((userId): userId is string => Boolean(userId))
    ),
  ];

  const [groupsResult, usersResult] = await Promise.all([
    readByIds<Pick<Tables<'workspace_user_groups'>, 'id' | 'name'>>(
      groupIds,
      (chunk) =>
        sbAdmin.from('workspace_user_groups').select('id,name').in('id', chunk)
    ),
    readByIds<
      Pick<
        Tables<'workspace_users'>,
        'id' | 'full_name' | 'display_name' | 'email'
      >
    >(userIds, (chunk) =>
      sbAdmin
        .from('workspace_users')
        .select('id,full_name,display_name,email')
        .in('id', chunk)
    ),
  ]);

  if (groupsResult.error || usersResult.error) {
    console.error('Failed to load tutoring export relations', {
      error: groupsResult.error ?? usersResult.error,
      wsId: normalizedWsId,
    });
    return NextResponse.json({ message: 'Export failed' }, { status: 500 });
  }

  const groupMap = new Map(
    (groupsResult.data ?? []).map((group) => [group.id, group])
  );
  const userMap = new Map(
    (usersResult.data ?? []).map((user) => [user.id, user])
  );
  const dataWithRelations = data.map((row) => ({
    ...row,
    group: row.group_id ? (groupMap.get(row.group_id) ?? null) : null,
    student: row.student_user_id
      ? (userMap.get(row.student_user_id) ?? null)
      : null,
    teacher: row.teacher_user_id
      ? (userMap.get(row.teacher_user_id) ?? null)
      : null,
  }));

  if (parsed.data.mode !== 'detailed') {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date());
    const report = calculateTutoringPayroll(dataWithRelations, today);
    return NextResponse.json({
      mode: 'payroll',
      data:
        parsed.data.mode === 'report'
          ? report
          : report
              .filter((row) => row.completed_sessions > 0)
              .map(
                ({
                  teacher_name,
                  completed_sessions,
                  total_minutes,
                  total_cong,
                }) => ({
                  teacher_name,
                  completed_sessions,
                  total_minutes,
                  total_cong,
                })
              ),
    });
  }

  return NextResponse.json({
    mode: 'detailed',
    data: dataWithRelations.map((row) => ({
      id: row.id,
      date: row.session_date,
      time: String(row.start_time).slice(0, 5),
      duration_minutes: row.duration_minutes,
      reason_type: row.reason_type,
      attendance_status: row.attendance_status,
      content: row.content,
      group_name: (row.group as { name: string | null } | null)?.name ?? 'N/A',
      student_name: nameOf(row.student),
      teacher_name: nameOf(row.teacher),
    })),
  });
}

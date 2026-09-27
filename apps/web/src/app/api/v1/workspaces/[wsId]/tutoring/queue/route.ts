import {
  readTutoringPolicy,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { TutoringQueueQuerySchema } from '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/shared';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

type QueueItem = {
  group_id: string;
  student_user_id: string;
  group_name: string;
  student_name: string;
  reason_type: 'ABSENT_RECOVERY' | 'WEAK_SUPPORT' | 'BOTH';
  absence_deficit: number;
  missed_class_dates: string[];
  feedback_content: string;
  feedback_created_at: string | null;
  source_feedback_id: string | null;
};

type QueueSummary = {
  absent: number;
  weak: number;
};

type IdentityRow = {
  full_name: string | null;
  display_name: string | null;
  email: string | null;
};

function nameOf(value: IdentityRow) {
  return (
    value.full_name?.trim() ||
    value.display_name?.trim() ||
    value.email?.trim() ||
    'Unknown'
  );
}

function isPresentId(value: string | null | undefined): value is string {
  return Boolean(value && value !== 'null' && value !== 'undefined');
}

function summarizeQueue(queue: QueueItem[]): QueueSummary {
  return queue.reduce(
    (summary, item) => {
      if (
        item.reason_type === 'ABSENT_RECOVERY' ||
        item.reason_type === 'BOTH'
      ) {
        summary.absent += 1;
      }
      if (item.reason_type === 'WEAK_SUPPORT' || item.reason_type === 'BOTH') {
        summary.weak += 1;
      }
      return summary;
    },
    { absent: 0, weak: 0 }
  );
}

async function getTutoringData(request: Request, { params }: Params) {
  const { wsId } = await params;
  const { normalizedWsId, permissions } = await resolveTutoringRouteAccess(
    request,
    wsId
  );

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = TutoringQueueQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const tutoringSessionsClient = sbAdmin.schema('private');

  let attendanceQuery = sbAdmin
    .from('user_group_attendance')
    .select(
      `group_id,user_id,date,status,
      group:workspace_user_groups!user_group_attendance_group_id_fkey!inner(id,ws_id,name),
      user:workspace_users!user_group_attendance_user_id_fkey!inner(id,full_name,display_name,email,archived)`
    )
    .eq('group.ws_id', normalizedWsId)
    .eq('user.archived', false)
    .gte(
      'date',
      new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
    )
    .in('status', ['ABSENT', 'Absent', 'absent'])
    .order('group_id', { ascending: true })
    .order('user_id', { ascending: true });

  if (parsed.data.groupId) {
    attendanceQuery = attendanceQuery.eq('group_id', parsed.data.groupId);
  }
  if (parsed.data.studentUserId) {
    attendanceQuery = attendanceQuery.eq('user_id', parsed.data.studentUserId);
  }

  let reservedQuery = tutoringSessionsClient
    .from('workspace_tutoring_sessions')
    .select(
      'group_id,student_user_id,reason_type,attendance_status,source_feedback_id,resolved_at,session_date'
    )
    .eq('ws_id', normalizedWsId)
    .in('attendance_status', ['DONE', 'PENDING']);

  if (parsed.data.groupId) {
    reservedQuery = reservedQuery.eq('group_id', parsed.data.groupId);
  }
  if (parsed.data.studentUserId) {
    reservedQuery = reservedQuery.eq(
      'student_user_id',
      parsed.data.studentUserId
    );
  }

  let feedbackQuery = sbAdmin
    .from('user_feedbacks')
    .select(
      `id,content,user_id,group_id,created_at,
      user:workspace_users!user_feedbacks_user_id_fkey!inner(id,ws_id,full_name,display_name,email,archived),
      group:workspace_user_groups!user_feedbacks_group_id_fkey(id,name)`
    )
    .eq('require_attention', true)
    .eq('user.ws_id', normalizedWsId)
    .eq('user.archived', false)
    .order('created_at', { ascending: false });

  if (parsed.data.groupId)
    feedbackQuery = feedbackQuery.eq('group_id', parsed.data.groupId);
  if (parsed.data.studentUserId)
    feedbackQuery = feedbackQuery.eq('user_id', parsed.data.studentUserId);

  const policyQuery = sbAdmin
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', normalizedWsId)
    .eq('id', TUTORING_POLICY_CONFIG_ID)
    .maybeSingle();

  // These reads are independent; the queue should wait for one database round
  // trip rather than stacking four round trips in series.
  const [attendanceResult, reservedResult, feedbackResult, policyResult] =
    await Promise.all([
      attendanceQuery,
      reservedQuery,
      feedbackQuery,
      policyQuery,
    ]);
  for (const [source, error] of [
    ['attendance', attendanceResult.error],
    ['sessions', reservedResult.error],
    ['feedback', feedbackResult.error],
    ['policy', policyResult.error],
  ] as const) {
    if (!error) continue;
    console.error(`Failed to load tutoring queue ${source}`, error);
    return NextResponse.json(
      { message: 'Failed to load queue' },
      { status: 500 }
    );
  }
  const attendanceRows = attendanceResult.data;
  const reservedRows = reservedResult.data;
  const feedbackRows = feedbackResult.data;
  const policy = readTutoringPolicy(policyResult.data?.value);
  const reassessmentDays = policy.reassessmentDays;
  const absenceCutoff = new Date(
    Date.now() - policy.absenceLookbackDays * 86_400_000
  )
    .toISOString()
    .slice(0, 10);
  const todayNumber = Math.floor(Date.now() / 86_400_000);

  const absenceCountMap = new Map<string, number>();
  const missedClassDatesMap = new Map<string, string[]>();
  const groupNameMap = new Map<string, string>();
  const studentNameMap = new Map<string, string>();

  for (const row of attendanceRows ?? []) {
    if (row.date < absenceCutoff) continue;
    const key = `${row.group_id}:${row.user_id}`;
    absenceCountMap.set(key, (absenceCountMap.get(key) ?? 0) + 1);
    missedClassDatesMap.set(key, [
      ...(missedClassDatesMap.get(key) ?? []),
      row.date,
    ]);

    if (row.group_id && row.group?.name) {
      groupNameMap.set(row.group_id, row.group.name);
    }
    if (row.user_id && row.user) {
      studentNameMap.set(row.user_id, nameOf(row.user));
    }
  }

  const reservedCountMap = new Map<string, number>();
  const scheduledFeedbackIds = new Set<string>();
  const completedFeedbackDays = new Map<string, number>();
  for (const row of reservedRows ?? []) {
    const key = `${row.group_id}:${row.student_user_id}`;
    if (
      row.reason_type === 'ABSENT_RECOVERY' &&
      row.session_date >= absenceCutoff
    )
      reservedCountMap.set(key, (reservedCountMap.get(key) ?? 0) + 1);
    if (row.attendance_status === 'PENDING' && row.source_feedback_id)
      scheduledFeedbackIds.add(row.source_feedback_id);
    if (
      row.attendance_status === 'DONE' &&
      row.source_feedback_id &&
      row.resolved_at
    ) {
      const resolvedDay = Math.floor(Date.parse(row.resolved_at) / 86_400_000);
      if (Number.isFinite(resolvedDay))
        completedFeedbackDays.set(
          row.source_feedback_id,
          Math.max(
            completedFeedbackDays.get(row.source_feedback_id) ?? -Infinity,
            resolvedDay
          )
        );
    }
  }

  const keySet = new Set<string>();
  for (const key of absenceCountMap.keys()) keySet.add(key);
  for (const row of feedbackRows ?? []) {
    if (isPresentId(row.group_id) && isPresentId(row.user_id)) {
      keySet.add(`${row.group_id}:${row.user_id}`);
    }
  }

  const pairs = [...keySet].map((key) => {
    const [groupId, studentId] = key.split(':');
    return { groupId, studentId, key };
  });

  const latestFeedbackMap = new Map<
    string,
    { id: string; content: string; createdAt: string }
  >();
  for (const row of feedbackRows ?? []) {
    if (!isPresentId(row.group_id) || !isPresentId(row.user_id)) {
      continue;
    }

    const key = `${row.group_id}:${row.user_id}`;
    if (!latestFeedbackMap.has(key)) {
      latestFeedbackMap.set(key, {
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
      });
    }

    if (row.group_id && row.group?.name) {
      groupNameMap.set(row.group_id, row.group.name);
    }
    if (row.user_id && row.user) {
      studentNameMap.set(row.user_id, nameOf(row.user));
    }
  }

  const buildQueueItem = (
    groupId: string,
    studentId: string,
    key: string
  ): QueueItem | null => {
    const deficit = Math.max(
      0,
      (absenceCountMap.get(key) ?? 0) - (reservedCountMap.get(key) ?? 0)
    );
    const feedback = latestFeedbackMap.get(key);
    const hasAbsent = deficit > 0;
    const completedDay = feedback
      ? completedFeedbackDays.get(feedback.id)
      : undefined;
    const hasWeak = Boolean(
      feedback &&
        !scheduledFeedbackIds.has(feedback.id) &&
        (completedDay === undefined ||
          todayNumber - completedDay >= reassessmentDays)
    );

    if (!hasAbsent && !hasWeak) return null;

    const reasonType: QueueItem['reason_type'] = hasAbsent
      ? hasWeak
        ? 'BOTH'
        : 'ABSENT_RECOVERY'
      : 'WEAK_SUPPORT';

    return {
      group_id: groupId,
      student_user_id: studentId,
      group_name: groupNameMap.get(groupId) ?? 'Unknown group',
      student_name: studentNameMap.get(studentId) ?? studentId,
      reason_type: reasonType,
      absence_deficit: deficit,
      missed_class_dates: (missedClassDatesMap.get(key) ?? [])
        .sort()
        .slice(-deficit),
      feedback_content: hasWeak ? (feedback?.content ?? '') : '',
      feedback_created_at: hasWeak ? (feedback?.createdAt ?? null) : null,
      source_feedback_id: hasWeak ? (feedback?.id ?? null) : null,
    };
  };

  const fullQueue: QueueItem[] = pairs
    .map(({ groupId, studentId, key }) => {
      if (!isPresentId(groupId) || !isPresentId(studentId)) return null;
      const item = buildQueueItem(groupId, studentId, key);
      if (!item) return null;
      return item;
    })
    .filter((value): value is QueueItem => value !== null)
    .sort((a, b) => {
      const groupComparison = a.group_name.localeCompare(b.group_name);
      if (groupComparison !== 0) return groupComparison;
      const studentComparison = a.student_name.localeCompare(b.student_name);
      if (studentComparison !== 0) return studentComparison;
      return `${a.group_id}:${a.student_user_id}`.localeCompare(
        `${b.group_id}:${b.student_user_id}`
      );
    });

  const searchTerm = (
    parsed.data.q ??
    parsed.data.query ??
    parsed.data.search ??
    ''
  )
    .trim()
    .toLowerCase();
  const filteredQueue = fullQueue.filter((item) => {
    if (parsed.data.reasonType && item.reason_type !== parsed.data.reasonType) {
      return false;
    }
    if (parsed.data.groupId && item.group_id !== parsed.data.groupId) {
      return false;
    }
    if (
      parsed.data.studentUserId &&
      item.student_user_id !== parsed.data.studentUserId
    ) {
      return false;
    }
    if (!searchTerm) {
      return true;
    }

    return [
      item.student_name,
      item.group_name,
      item.reason_type,
      item.feedback_content,
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  });

  const { page, pageSize } = parsed.data;
  const totalCount = filteredQueue.length;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const start = (page - 1) * pageSize;
  const pagedQueue = filteredQueue.slice(start, start + pageSize);

  return NextResponse.json({
    data: pagedQueue,
    count: totalCount,
    page,
    pageSize,
    summary: summarizeQueue(filteredQueue),
    totalPages,
  });
}

export const GET = createLegacyGetHandler(getTutoringData);
export const HEAD = createLegacyHeadHandler(GET);

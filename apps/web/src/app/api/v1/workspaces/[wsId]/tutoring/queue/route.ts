import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { TutoringQueueQuerySchema } from '../shared';

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
  feedback_content: string;
  source_feedback_id: string | null;
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

  let attendanceQuery = sbAdmin
    .from('user_group_attendance')
    .select(
      `group_id,user_id,status,
      group:workspace_user_groups!inner(id,ws_id,name),
      user:workspace_users!inner(id,full_name,display_name,email,archived)`
    )
    .eq('group.ws_id', wsId)
    .eq('user.archived', false)
    .in('status', ['ABSENT', 'Absent', 'absent']);

  if (parsed.data.groupId) {
    attendanceQuery = attendanceQuery.eq('group_id', parsed.data.groupId);
  }
  if (parsed.data.studentUserId) {
    attendanceQuery = attendanceQuery.eq('user_id', parsed.data.studentUserId);
  }

  const { data: attendanceRows, error: attendanceError } =
    await attendanceQuery;

  if (attendanceError) {
    serverLogger.error(
      'Failed to load attendance deficits for tutoring queue',
      attendanceError
    );
    return NextResponse.json(
      { message: 'Failed to load queue' },
      { status: 500 }
    );
  }

  let completedQuery = sbAdmin
    .from('workspace_tutoring_sessions')
    .select('group_id,student_user_id')
    .eq('ws_id', wsId)
    .eq('reason_type', 'ABSENT_RECOVERY')
    .eq('attendance_status', 'DONE');

  if (parsed.data.groupId) {
    completedQuery = completedQuery.eq('group_id', parsed.data.groupId);
  }
  if (parsed.data.studentUserId) {
    completedQuery = completedQuery.eq(
      'student_user_id',
      parsed.data.studentUserId
    );
  }

  const { data: completedRows, error: completedError } = await completedQuery;

  if (completedError) {
    serverLogger.error(
      'Failed to load completed tutoring sessions',
      completedError
    );
    return NextResponse.json(
      { message: 'Failed to load queue' },
      { status: 500 }
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
    .eq('user.ws_id', wsId)
    .eq('user.archived', false)
    .order('created_at', { ascending: false });

  if (parsed.data.groupId)
    feedbackQuery = feedbackQuery.eq('group_id', parsed.data.groupId);
  if (parsed.data.studentUserId)
    feedbackQuery = feedbackQuery.eq('user_id', parsed.data.studentUserId);

  const { data: feedbackRows, error: feedbackError } = await feedbackQuery;

  if (feedbackError) {
    serverLogger.error(
      'Failed to load attention feedback for tutoring queue',
      feedbackError
    );
    return NextResponse.json(
      { message: 'Failed to load queue' },
      { status: 500 }
    );
  }

  const absenceCountMap = new Map<string, number>();
  const groupNameMap = new Map<string, string>();
  const studentNameMap = new Map<string, string>();

  for (const row of attendanceRows ?? []) {
    const key = `${row.group_id}:${row.user_id}`;
    absenceCountMap.set(key, (absenceCountMap.get(key) ?? 0) + 1);

    if (row.group_id && row.group?.name) {
      groupNameMap.set(row.group_id, row.group.name);
    }
    if (row.user_id && row.user) {
      studentNameMap.set(row.user_id, nameOf(row.user));
    }
  }

  const completedCountMap = new Map<string, number>();
  for (const row of completedRows ?? []) {
    const key = `${row.group_id}:${row.student_user_id}`;
    completedCountMap.set(key, (completedCountMap.get(key) ?? 0) + 1);
  }

  const keySet = new Set<string>();
  for (const key of absenceCountMap.keys()) keySet.add(key);
  for (const row of feedbackRows ?? [])
    keySet.add(`${row.group_id}:${row.user_id}`);

  const pairs = [...keySet].map((key) => {
    const [groupId, studentId] = key.split(':');
    return { groupId, studentId, key };
  });

  const latestFeedbackMap = new Map<string, { id: string; content: string }>();
  for (const row of feedbackRows ?? []) {
    const key = `${row.group_id}:${row.user_id}`;
    if (!latestFeedbackMap.has(key)) {
      latestFeedbackMap.set(key, { id: row.id, content: row.content });
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
      (absenceCountMap.get(key) ?? 0) - (completedCountMap.get(key) ?? 0)
    );
    const feedback = latestFeedbackMap.get(key);
    const hasAbsent = deficit > 0;
    const hasWeak = Boolean(feedback);

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
      feedback_content: feedback?.content ?? '',
      source_feedback_id: feedback?.id ?? null,
    };
  };

  const fullQueue: QueueItem[] = pairs
    .map(({ groupId, studentId, key }) => {
      if (!groupId || !studentId) return null;
      const item = buildQueueItem(groupId, studentId, key);
      if (!item) return null;

      if (
        parsed.data.reasonType &&
        item.reason_type !== parsed.data.reasonType
      ) {
        return null;
      }
      if (parsed.data.groupId && item.group_id !== parsed.data.groupId)
        return null;
      if (
        parsed.data.studentUserId &&
        item.student_user_id !== parsed.data.studentUserId
      ) {
        return null;
      }
      return item;
    })
    .filter((value): value is QueueItem => value !== null);

  const { page, pageSize } = parsed.data;
  const totalCount = fullQueue.length;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const start = (page - 1) * pageSize;
  const pagedQueue = fullQueue.slice(start, start + pageSize);

  return NextResponse.json({
    data: pagedQueue,
    count: totalCount,
    page,
    pageSize,
    totalPages,
  });
}

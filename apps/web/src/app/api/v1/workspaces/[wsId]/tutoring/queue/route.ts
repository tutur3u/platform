import {
  hasTutoringTagExclusions,
  isTutoringGroupExcluded,
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import {
  isWeakContentReviewDue,
  type TutoringFeedbackSnapshot,
  unchangedFeedbackSince,
} from '@tuturuuu/internal-api/tutoring-queue-rules';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { TutoringQueueQuerySchema } from '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/shared';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';

import { unmatchedAbsenceDates } from './absence-credits';
import { readAllRows } from './all-rows';
import { loadQueueLessonNotes } from './queue-lesson-content';
import {
  loadCurrentLearnerMemberships,
  loadGroupTagNames,
  type QueueIdentity,
  supportQueueKeys,
} from './queue-membership';

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
  content_feedback_id: string | null;
  // Set only when the lesson-notes lookup succeeded; when omitted the client
  // reads the class sessions itself.
  missed_lesson_content?: string;
  missed_post_content?: string;
  missing_lesson_dates?: string[];
  missed_lesson_by_date?: Record<string, string>;
  missed_post_by_date?: Record<string, string>;
  content_review_due: boolean;
  content_unchanged_since: string | null;
  review_only: boolean;
  support_group?: boolean;
};

type QueueSummary = {
  absent: number;
  weak: number;
  review_due: number;
};

function nameOf(value: QueueIdentity) {
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
      if (
        !item.review_only &&
        (item.reason_type === 'WEAK_SUPPORT' || item.reason_type === 'BOTH')
      ) {
        summary.weak += 1;
      }
      if (item.content_review_due) summary.review_due += 1;
      return summary;
    },
    { absent: 0, weak: 0, review_due: 0 }
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

  // Each workspace-wide read is paged: a single select stops at max_rows and
  // would silently drop absences of learners whose group sorts later.
  const attendancePage = (from: number, to: number) => {
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
      .order('user_id', { ascending: true })
      .order('id', { ascending: true });

    if (parsed.data.groupId) {
      attendanceQuery = attendanceQuery.eq('group_id', parsed.data.groupId);
    }
    if (parsed.data.studentUserId) {
      attendanceQuery = attendanceQuery.eq(
        'user_id',
        parsed.data.studentUserId
      );
    }
    return attendanceQuery.range(from, to);
  };

  const reservedPage = (from: number, to: number) => {
    let reservedQuery = tutoringSessionsClient
      .from('workspace_tutoring_sessions')
      .select(
        'group_id,student_user_id,reason_type,attendance_status,source_feedback_id,resolved_at,session_date'
      )
      .eq('ws_id', normalizedWsId)
      .in('attendance_status', ['DONE', 'PENDING'])
      .order('id', { ascending: true });

    if (parsed.data.groupId) {
      reservedQuery = reservedQuery.eq('group_id', parsed.data.groupId);
    }
    if (parsed.data.studentUserId) {
      reservedQuery = reservedQuery.eq(
        'student_user_id',
        parsed.data.studentUserId
      );
    }
    return reservedQuery.range(from, to);
  };

  const feedbackPage = (from: number, to: number) => {
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
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (parsed.data.groupId)
      feedbackQuery = feedbackQuery.eq('group_id', parsed.data.groupId);
    if (parsed.data.studentUserId)
      feedbackQuery = feedbackQuery.eq('user_id', parsed.data.studentUserId);
    return feedbackQuery.range(from, to);
  };

  const policyQuery = sbAdmin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', normalizedWsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);

  // These reads are independent; the queue should wait for one database round
  // trip rather than stacking four round trips in series.
  const [attendanceResult, reservedResult, feedbackResult, policyResult] =
    await Promise.all([
      readAllRows(attendancePage),
      readAllRows(reservedPage),
      readAllRows(feedbackPage),
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
  const policy = readTutoringPolicyConfigRows(policyResult.data ?? []);
  // Learners are listed only under the classes they belong to now. Support
  // expansion needs every class of each member, so a group filter narrows
  // the read only when no support group is configured.
  const [membershipResult, tagResult] = await Promise.all([
    loadCurrentLearnerMemberships({
      sbAdmin,
      wsId: normalizedWsId,
      groupIds:
        parsed.data.groupId && policy.supportGroupIds.length === 0
          ? [parsed.data.groupId]
          : undefined,
      studentUserId: parsed.data.studentUserId,
    }),
    hasTutoringTagExclusions(policy)
      ? loadGroupTagNames({ sbAdmin, wsId: normalizedWsId })
      : { data: new Map<string, string[]>(), error: null },
  ]);
  for (const [source, error] of [
    ['memberships', membershipResult.error],
    ['group tags', tagResult.error],
  ] as const) {
    if (!error) continue;
    console.error(`Failed to load tutoring queue ${source}`, error);
    return NextResponse.json(
      { message: 'Failed to load queue' },
      { status: 500 }
    );
  }
  const groupTags = tagResult.data;
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
  const currentKeys = new Set<string>();
  for (const row of membershipResult.data) {
    currentKeys.add(`${row.group_id}:${row.user_id}`);
    if (row.group?.name) groupNameMap.set(row.group_id, row.group.name);
    if (row.user) studentNameMap.set(row.user_id, nameOf(row.user));
  }
  const supportKeys = supportQueueKeys(membershipResult.data, policy);

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

  const reservedDatesMap = new Map<string, string[]>();
  const sessionSourceIds = new Map<string, Set<string>>();
  const scheduledFeedbackIds = new Set<string>();
  const completedFeedbackDays = new Map<string, number>();
  const pendingWeakKeys = new Set<string>();
  const doneWeakDays = new Map<string, number>();
  for (const row of reservedRows ?? []) {
    const key = `${row.group_id}:${row.student_user_id}`;
    if (row.reason_type === 'WEAK_SUPPORT') {
      if (row.attendance_status === 'PENDING') pendingWeakKeys.add(key);
      const doneDay = Math.floor(
        Date.parse(row.resolved_at ?? row.session_date) / 86_400_000
      );
      if (row.attendance_status === 'DONE' && Number.isFinite(doneDay))
        doneWeakDays.set(
          key,
          Math.max(doneWeakDays.get(key) ?? doneDay, doneDay)
        );
    }
    if (
      row.reason_type === 'ABSENT_RECOVERY' &&
      row.session_date >= absenceCutoff
    )
      reservedDatesMap.set(key, [
        ...(reservedDatesMap.get(key) ?? []),
        row.session_date,
      ]);
    if (row.source_feedback_id) {
      const sources = sessionSourceIds.get(key) ?? new Set<string>();
      sources.add(row.source_feedback_id);
      sessionSourceIds.set(key, sources);
    }
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

  // History in a class the learner has left stays recorded but unlisted.
  const keySet = new Set<string>(supportKeys);
  for (const key of absenceCountMap.keys())
    if (currentKeys.has(key)) keySet.add(key);
  for (const row of feedbackRows ?? []) {
    const key = `${row.group_id}:${row.user_id}`;
    if (
      isPresentId(row.group_id) &&
      isPresentId(row.user_id) &&
      currentKeys.has(key)
    )
      keySet.add(key);
  }

  const pairs = [...keySet].map((key) => {
    const [groupId, studentId] = key.split(':');
    return { groupId, studentId, key };
  });

  const latestFeedbackMap = new Map<
    string,
    { id: string; content: string; createdAt: string }
  >();
  const triggeringFeedbackMap = new Map<
    string,
    { id: string; content: string | null }
  >();
  const feedbackHistoryMap = new Map<string, TutoringFeedbackSnapshot[]>();
  for (const row of feedbackRows ?? []) {
    if (!isPresentId(row.group_id) || !isPresentId(row.user_id)) {
      continue;
    }

    const key = `${row.group_id}:${row.user_id}`;
    const history = feedbackHistoryMap.get(key) ?? [];
    history.push({ content: row.content, createdAt: row.created_at });
    feedbackHistoryMap.set(key, history);
    // Newest first, so the last hit is the oldest feedback a session was
    // opened from: the note written when the learner entered support.
    if (sessionSourceIds.get(key)?.has(row.id)) {
      triggeringFeedbackMap.set(key, { id: row.id, content: row.content });
    }
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
    const remainingDates = unmatchedAbsenceDates(
      missedClassDatesMap.get(key) ?? [],
      reservedDatesMap.get(key) ?? []
    );
    const deficit = remainingDates.length;
    const feedback = latestFeedbackMap.get(key);
    const groupName = groupNameMap.get(groupId) ?? 'Unknown group';
    const tags = groupTags.get(groupId) ?? [];
    const hasAbsent =
      deficit > 0 &&
      !isTutoringGroupExcluded(policy, groupName, 'make_up', groupId, tags);
    const completedDay = feedback
      ? completedFeedbackDays.get(feedback.id)
      : undefined;
    const weakExcluded = isTutoringGroupExcluded(
      policy,
      groupName,
      'weak_support',
      groupId,
      tags
    );
    const feedbackWeak = Boolean(
      feedback &&
        !weakExcluded &&
        !scheduledFeedbackIds.has(feedback.id) &&
        (completedDay === undefined ||
          todayNumber - completedDay >= reassessmentDays)
    );
    // A support-group learner needs weak support until a session is pending,
    // and again once the reassessment interval after a completed one passes.
    const doneWeakDay = doneWeakDays.get(key);
    const supportWeak =
      supportKeys.has(key) &&
      !weakExcluded &&
      !pendingWeakKeys.has(key) &&
      (doneWeakDay === undefined ||
        todayNumber - doneWeakDay >= reassessmentDays);
    const hasWeak = feedbackWeak || supportWeak;

    const contentUnchangedSince =
      feedback && !weakExcluded
        ? unchangedFeedbackSince(feedbackHistoryMap.get(key) ?? [])
        : null;
    const contentReviewDue = isWeakContentReviewDue(
      policy,
      contentUnchangedSince
    );
    if (!hasAbsent && !hasWeak && !contentReviewDue) return null;
    const reviewOnly = !hasAbsent && !hasWeak;

    // Scheduling and reassessment follow the latest feedback above. The text
    // staff teach from is the feedback a session was first opened from, so a
    // later flagged note does not replace what the homeroom teacher wrote when
    // moving the learner into support. With none tied, the latest is used.
    const contentFeedback = triggeringFeedbackMap.get(key) ?? feedback;

    const reasonType: QueueItem['reason_type'] = hasAbsent
      ? hasWeak
        ? 'BOTH'
        : 'ABSENT_RECOVERY'
      : 'WEAK_SUPPORT';

    return {
      group_id: groupId,
      student_user_id: studentId,
      group_name: groupName,
      student_name: studentNameMap.get(studentId) ?? studentId,
      reason_type: reasonType,
      absence_deficit: hasAbsent ? deficit : 0,
      missed_class_dates: hasAbsent ? remainingDates : [],
      feedback_content:
        hasWeak || contentReviewDue ? (contentFeedback?.content ?? '') : '',
      feedback_created_at:
        hasWeak || contentReviewDue ? (feedback?.createdAt ?? null) : null,
      source_feedback_id: feedbackWeak ? (feedback?.id ?? null) : null,
      content_feedback_id:
        hasWeak || contentReviewDue ? (contentFeedback?.id ?? null) : null,
      content_review_due: contentReviewDue,
      content_unchanged_since: contentUnchangedSince,
      review_only: reviewOnly,
      ...(supportKeys.has(key) ? { support_group: true } : {}),
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

  // Only the visible page needs lesson notes. A failed lookup leaves the rows
  // without notes (and without a "none recorded" claim) rather than failing.
  const lessonNotes = await loadQueueLessonNotes({
    // Post text needs the same permission as reading the class's posts.
    includePosts: !permissions.withoutPermission('view_user_groups_posts'),
    sbAdmin,
    targets: pagedQueue,
    wsId: normalizedWsId,
  }).catch((error) => {
    console.error('Failed to load tutoring queue lesson notes', error);
    return null;
  });
  const data = pagedQueue.map((item) => {
    const notes = lessonNotes?.get(`${item.group_id}:${item.student_user_id}`);
    return notes
      ? {
          ...item,
          missed_lesson_content: notes.content,
          missed_post_content: notes.postContent,
          missed_lesson_by_date: notes.contentByDate ?? {},
          missed_post_by_date: notes.postContentByDate ?? {},
          missing_lesson_dates: notes.missingDates,
        }
      : item;
  });

  return NextResponse.json({
    data,
    count: totalCount,
    page,
    pageSize,
    summary: summarizeQueue(filteredQueue),
    totalPages,
  });
}

export const GET = createLegacyGetHandler(getTutoringData);
export const HEAD = createLegacyHeadHandler(GET);

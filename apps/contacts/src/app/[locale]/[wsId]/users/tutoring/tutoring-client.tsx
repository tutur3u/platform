'use client';

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CalendarClock, LifeBuoy, Settings2 } from '@tuturuuu/icons';
import {
  createTutoringSession,
  listAllWorkspaceUserGroups,
  listTutoringSessions,
  listWorkspaceUserGroupSessions,
  markTutoringSession,
  type TutoringQueueItem,
} from '@tuturuuu/internal-api';
import { getTutoringPolicy } from '@tuturuuu/internal-api/tutoring';
import { STANDARD_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { suggestTutoringSlots } from '@tuturuuu/internal-api/tutoring-suggestion';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';
import { getMissedLessonContent } from './tutoring-content';
import {
  addDaysToIsoDate,
  buildTutoringSessionQuery,
  buildTutoringStatQuery,
  DEFAULT_SESSION_FILTERS,
  isTutoringDateRange,
  TUTORING_STAT_KEYS,
  type TutoringSessionFilters,
  toIsoDate,
} from './tutoring-filters';
import { TutoringOverview } from './tutoring-overview';
import { TutoringPolicyCard } from './tutoring-policy-card';
import { TutoringQueueCard } from './tutoring-queue-card';
import { TutoringSessionsCard } from './tutoring-sessions-card';
import {
  DEFAULT_FORM,
  findSessionSlotConflicts,
  type TutoringFormValues,
} from './tutoring-types';

interface Props {
  wsId: string;
  canManage: boolean;
  canConfigure: boolean;
}

export function TutoringClient({ wsId, canManage, canConfigure }: Props) {
  const t = useTranslations('ws-tutoring');
  const locale = useLocale();
  const queryClient = useQueryClient();

  // One shared "today" so every range preset, stat window, and export agrees.
  // A dashboard is routinely left open overnight, so roll it over at the next
  // local midnight instead of pinning it until the component remounts.
  const [today, setToday] = useState(() => toIsoDate(new Date()));

  useEffect(() => {
    const now = new Date();
    const current = toIsoDate(now);

    // Re-runs on every rollover so the *next* midnight gets armed too. Reading
    // the current date here also corrects the state when a suspended tab wakes
    // up on a later day than the one the timer was scheduled for.
    if (current !== today) {
      setToday(current);
      return;
    }

    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    const timer = setTimeout(
      () => setToday(toIsoDate(new Date())),
      // +1s of slack so the timer never fires a hair before the day flips.
      nextMidnight.getTime() - now.getTime() + 1000
    );

    return () => clearTimeout(timer);
  }, [today]);

  const [tab, setTab] = useQueryState(
    'tab',
    parseAsString.withDefault('sessions').withOptions({ shallow: true })
  );
  const [dateRange, setDateRange] = useQueryState(
    'range',
    parseAsString
      .withDefault(DEFAULT_SESSION_FILTERS.dateRange)
      .withOptions({ shallow: true })
  );
  const [sessionReasonType, setSessionReasonType] = useQueryState(
    'sessionReasonType',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [sessionAttendance, setSessionAttendance] = useQueryState(
    'sessionAttendance',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [sessionGroupId, setSessionGroupId] = useQueryState(
    'sessionGroupId',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [sessionStudentId, setSessionStudentId] = useQueryState(
    'sessionStudentId',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [sessionTeacherId, setSessionTeacherId] = useQueryState(
    'sessionTeacherId',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [sessionPage, setSessionPage] = useQueryState(
    'sessionPage',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [sessionPageSize, setSessionPageSize] = useQueryState(
    'sessionPageSize',
    parseAsInteger.withDefault(20).withOptions({ shallow: true })
  );
  const [queueReasonType, setQueueReasonType] = useQueryState(
    'queueReasonType',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [queueGroupId, setQueueGroupId] = useQueryState(
    'queueGroupId',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [queueStudentId, setQueueStudentId] = useQueryState(
    'queueStudentId',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [queueSearch, setQueueSearch] = useQueryState(
    'queueSearch',
    parseAsString
      .withDefault('')
      .withOptions({ shallow: true, throttleMs: 300 })
  );
  const [queuePage, setQueuePage] = useQueryState(
    'queuePage',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [queuePageSize, setQueuePageSize] = useQueryState(
    'queuePageSize',
    parseAsInteger.withDefault(20).withOptions({ shallow: true })
  );
  const [form, setForm] = useState<TutoringFormValues>(DEFAULT_FORM);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [schedulingKey, setSchedulingKey] = useState<string | null>(null);
  const policyQuery = useQuery({
    queryKey: ['tutoring-policy', wsId],
    queryFn: () => getTutoringPolicy(wsId),
    staleTime: 5 * 60_000,
  });
  const policy = policyQuery.data?.policy ?? STANDARD_TUTORING_POLICY;

  const filters: TutoringSessionFilters = {
    attendanceStatus: sessionAttendance,
    dateRange: isTutoringDateRange(dateRange)
      ? dateRange
      : DEFAULT_SESSION_FILTERS.dateRange,
    groupId: sessionGroupId,
    reasonType: sessionReasonType,
    studentUserId: sessionStudentId,
    teacherUserId: sessionTeacherId,
  };
  // Rebuilt each render on purpose: TanStack hashes query keys structurally, so
  // a fresh object with the same values does not refetch.
  const sessionQuery = buildTutoringSessionQuery(filters, today);

  const sessionsQuery = useQuery({
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryKey: [
      'tutoring-sessions',
      wsId,
      sessionQuery,
      sessionPage,
      sessionPageSize,
    ],
    queryFn: () =>
      listTutoringSessions(wsId, {
        ...sessionQuery,
        page: sessionPage,
        pageSize: sessionPageSize,
      }),
  });

  const statQueries = useQueries({
    queries: TUTORING_STAT_KEYS.map((key) => ({
      enabled: sessionsQuery.isSuccess,
      queryKey: ['tutoring-session-stats', wsId, key, today],
      queryFn: () =>
        listTutoringSessions(wsId, {
          ...buildTutoringStatQuery(key, today),
          page: 1,
          pageSize: 1,
        }),
      staleTime: 60_000,
    })),
  });

  const groupsQuery = useQuery({
    enabled: createDialogOpen || tab === 'queue' || sessionsQuery.isFetched,
    queryKey: ['tutoring-groups', wsId],
    queryFn: () => listAllWorkspaceUserGroups(wsId, { status: 'active' }),
    staleTime: 5 * 60_000,
  });

  const invalidateTutoring = () => {
    for (const key of [
      'tutoring-sessions',
      'tutoring-session-stats',
      'tutoring-queue',
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key, wsId] });
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (
        !form.groupId ||
        !form.studentUserId ||
        form.sessionSlots.length < 1
      ) {
        throw new Error(t('missing_required'));
      }

      for (const slot of form.sessionSlots) {
        if (!(slot.sessionDate && slot.startTime)) {
          throw new Error(t('missing_required'));
        }
        if (slot.durationMinutes < 1 || slot.durationMinutes > 480) {
          throw new Error(t('invalid_duration'));
        }
      }

      const conflict = findSessionSlotConflicts(form)[0];
      if (conflict) {
        const slotA = conflict.firstIndex + 1;
        const slotB = conflict.secondIndex + 1;
        throw new Error(
          conflict.conflictType === 'teacher'
            ? t('conflict_teacher_slots', { slotA, slotB })
            : t('conflict_student_slots', { slotA, slotB })
        );
      }

      return createTutoringSession(wsId, {
        content: form.content,
        groupId: form.groupId,
        reasonDetail: form.reasonDetail,
        reasonType: form.reasonType,
        sessions: form.sessionSlots,
        sourceFeedbackId: form.sourceFeedbackId ?? null,
        studentUserId: form.studentUserId,
      });
    },
    onSuccess: ({ createdCount }) => {
      toast.success(
        createdCount > 1
          ? t('created_multiple', { count: createdCount })
          : t('created')
      );
      setForm(DEFAULT_FORM);
      setCreateDialogOpen(false);
      invalidateTutoring();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('create_failed'));
    },
  });

  const markMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: Parameters<typeof markTutoringSession>[2];
    }) => markTutoringSession(wsId, id, status),
    onSuccess: () => {
      toast.success(t('marked'));
      invalidateTutoring();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('mark_failed'));
    },
  });

  const sessions = sessionsQuery.data?.data ?? [];

  const prefillFromQueue = async (item: TutoringQueueItem) => {
    const key = `${item.group_id}:${item.student_user_id}`;
    setSchedulingKey(key);
    // The tutoring teacher is independent of the class's homeroom teacher.
    const teacherUserId = '';

    const count = Math.min(
      50,
      Math.max(
        1,
        item.absence_deficit,
        item.reason_type !== 'ABSENT_RECOVERY' ? policy.weakSupportSessions : 1
      )
    );
    let suggestions: ReturnType<typeof suggestTutoringSlots> = [];
    let makeupContent = '';
    const [futureSchedule, missedLessons] = await Promise.allSettled([
      queryClient.fetchQuery({
        queryKey: [
          'tutoring-class-schedule',
          wsId,
          item.group_id,
          today,
          policy.schedulingHorizonDays,
        ],
        queryFn: () =>
          listWorkspaceUserGroupSessions(wsId, {
            from: today,
            groupId: item.group_id,
            to: addDaysToIsoDate(today, policy.schedulingHorizonDays),
          }),
        staleTime: 5 * 60_000,
      }),
      item.missed_class_dates.length
        ? queryClient.fetchQuery({
            queryKey: [
              'tutoring-missed-lessons',
              wsId,
              item.group_id,
              item.missed_class_dates,
            ],
            queryFn: () =>
              listWorkspaceUserGroupSessions(wsId, {
                from: item.missed_class_dates[0] ?? today,
                groupId: item.group_id,
                to: today,
              }),
            staleTime: 5 * 60_000,
          })
        : Promise.resolve(null),
    ]);
    if (futureSchedule.status === 'fulfilled') {
      suggestions = suggestTutoringSlots(
        futureSchedule.value.data ?? [],
        addDaysToIsoDate(today, -1),
        count,
        policy,
        item.reason_type === 'WEAK_SUPPORT' ? 'consecutive' : 'separate'
      );
    }
    if (missedLessons.status === 'fulfilled' && missedLessons.value) {
      makeupContent = getMissedLessonContent(
        missedLessons.value.data ?? [],
        item.missed_class_dates
      );
    }
    setForm((current) => ({
      ...current,
      content:
        item.reason_type === 'WEAK_SUPPORT'
          ? item.feedback_content
          : makeupContent,
      groupId: item.group_id,
      reasonDetail: item.feedback_content,
      reasonType:
        item.reason_type === 'WEAK_SUPPORT'
          ? 'WEAK_SUPPORT'
          : 'ABSENT_RECOVERY',
      sessionSlots: Array.from({ length: count }, (_, index) => ({
        durationMinutes:
          suggestions[index]?.durationMinutes ?? policy.durationMinutes,
        sessionDate: suggestions[index]?.sessionDate ?? '',
        startTime: suggestions[index]?.startTime ?? '18:00',
        teacherUserId,
      })),
      sourceFeedbackId: item.source_feedback_id,
      studentLabel: item.student_name,
      studentUserId: item.student_user_id,
    }));
    setCreateDialogOpen(true);
    setSchedulingKey(null);
    void setTab('sessions');
  };

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-3 py-5 md:px-8 md:py-8">
      <FeatureSummary
        description={t('page_description')}
        pluralTitle={t('page_title')}
        singularTitle={t('page_title')}
      />

      <TutoringOverview
        counts={{
          completed: statQueries[2]?.data?.count,
          missed: statQueries[3]?.data?.count,
          pending: statQueries[1]?.data?.count,
          today: statQueries[0]?.data?.count,
        }}
        isLoading={
          sessionsQuery.isLoading ||
          (sessionsQuery.isSuccess &&
            statQueries.some((query) => query.isLoading))
        }
      />

      <Tabs
        className="space-y-4"
        onValueChange={(value) => void setTab(value)}
        value={tab === 'queue' || tab === 'policy' ? tab : 'sessions'}
      >
        <TabsList className="h-auto">
          <TabsTrigger className="gap-2" value="sessions">
            <CalendarClock className="h-4 w-4" />
            {t('sessions_tab')}
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="queue">
            <LifeBuoy className="h-4 w-4" />
            {t('queue_tab')}
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="policy">
            <Settings2 className="h-4 w-4" />
            {t('policy_tab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="sessions">
          <TutoringSessionsCard
            actions={{
              onCreate: () => createMutation.mutate(),
              onCreateDialogOpenChange: setCreateDialogOpen,
              onCreateFormChange: setForm,
              onFiltersChange: (next) => {
                if (next.dateRange !== undefined)
                  void setDateRange(next.dateRange);
                if (next.attendanceStatus !== undefined) {
                  void setSessionAttendance(next.attendanceStatus);
                }
                if (next.groupId !== undefined)
                  void setSessionGroupId(next.groupId);
                if (next.reasonType !== undefined) {
                  void setSessionReasonType(next.reasonType);
                }
                if (next.studentUserId !== undefined) {
                  void setSessionStudentId(next.studentUserId);
                }
                if (next.teacherUserId !== undefined) {
                  void setSessionTeacherId(next.teacherUserId);
                }
                void setSessionPage(1);
              },
              onMark: (id, status) => markMutation.mutate({ id, status }),
              onParamsChange: ({ page, pageSize }) => {
                if (page) void setSessionPage(page);
                if (pageSize) void setSessionPageSize(Number(pageSize));
              },
              onResetFilters: () => {
                void setDateRange(DEFAULT_SESSION_FILTERS.dateRange);
                void setSessionAttendance('all');
                void setSessionGroupId('all');
                void setSessionReasonType('all');
                void setSessionStudentId('all');
                void setSessionTeacherId('all');
                void setSessionPage(1);
              },
            }}
            canManage={canManage}
            create={{
              form,
              isSubmitting: createMutation.isPending,
              open: createDialogOpen,
            }}
            exportQuery={sessionQuery}
            filters={filters}
            groups={groupsQuery.data ?? []}
            isLoading={sessionsQuery.isLoading}
            isRefreshing={sessionsQuery.isFetching && !sessionsQuery.isLoading}
            error={sessionsQuery.isError ? t('sessions_load_failed') : null}
            onRetry={() => void sessionsQuery.refetch()}
            isMarking={markMutation.isPending}
            locale={locale}
            pagination={{
              count: sessionsQuery.data?.count ?? 0,
              page: sessionsQuery.data?.page ?? sessionPage,
              pageSize: sessionsQuery.data?.pageSize ?? sessionPageSize,
            }}
            policy={policy}
            sessions={sessions}
            students={sessions
              .map((session) => session.student)
              .filter((student) => student !== null)}
            wsId={wsId}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="queue">
          <TutoringQueueCard
            actions={{
              onGroupIdChange: (value) => {
                void setQueueGroupId(value);
                void setQueueStudentId('all');
                void setQueuePage(1);
              },
              onParamsChange: ({ page, pageSize }) => {
                if (page) void setQueuePage(page);
                if (pageSize) void setQueuePageSize(Number(pageSize));
              },
              onReasonTypeChange: (value) => {
                void setQueueReasonType(value);
                void setQueuePage(1);
              },
              onResetFilters: () => {
                void setQueueReasonType('all');
                void setQueueGroupId('all');
                void setQueueStudentId('all');
                void setQueueSearch('');
                void setQueuePage(1);
              },
              onSchedule: prefillFromQueue,
              onSearchChange: (value) => {
                void setQueueSearch(value);
                void setQueuePage(1);
              },
              onStudentUserIdChange: (value) => {
                void setQueueStudentId(value);
                void setQueuePage(1);
              },
            }}
            canManage={canManage}
            enabled={tab === 'queue'}
            schedulingKey={schedulingKey}
            filters={{
              groupId: queueGroupId,
              reasonType: queueReasonType,
              search: queueSearch,
              studentUserId: queueStudentId,
            }}
            groups={groupsQuery.data ?? []}
            pagination={{ page: queuePage, pageSize: queuePageSize }}
            policy={policy}
            wsId={wsId}
          />
        </TabsContent>
        <TabsContent className="space-y-4" value="policy">
          {policyQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-12 animate-pulse rounded-xl bg-muted" />
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : policyQuery.isError ? (
            <div className="rounded-xl border p-5">
              <p className="text-sm">{t('policy_load_failed')}</p>
              <button
                className="mt-2 text-sm underline"
                onClick={() => void policyQuery.refetch()}
                type="button"
              >
                {t('retry')}
              </button>
            </div>
          ) : (
            <TutoringPolicyCard
              canConfigure={canConfigure}
              groups={groupsQuery.data ?? []}
              policy={policy}
              wsId={wsId}
            />
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

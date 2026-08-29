'use client';

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CalendarClock, LifeBuoy } from '@tuturuuu/icons';
import {
  createTutoringSession,
  listAllWorkspaceUserGroups,
  listTutoringQueue,
  listTutoringSessions,
  markTutoringSession,
  type TutoringQueueItem,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useState } from 'react';
import {
  buildTutoringSessionQuery,
  buildTutoringStatQuery,
  DEFAULT_SESSION_FILTERS,
  isTutoringDateRange,
  TUTORING_STAT_KEYS,
  type TutoringSessionFilters,
  toIsoDate,
} from './tutoring-filters';
import { TutoringOverview } from './tutoring-overview';
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
}

export function TutoringClient({ wsId, canManage }: Props) {
  const t = useTranslations('ws-tutoring');
  const locale = useLocale();
  const queryClient = useQueryClient();

  // Pinned on mount so every range preset, stat window, and refetch in this
  // view agrees on "today" even when the tab stays open across midnight.
  const [today] = useState(() => toIsoDate(new Date()));

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

  const queueSummaryQuery = useQuery({
    queryKey: ['tutoring-queue-summary', wsId],
    queryFn: () => listTutoringQueue(wsId, { page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });

  const groupsQuery = useQuery({
    queryKey: ['tutoring-groups', wsId],
    queryFn: () => listAllWorkspaceUserGroups(wsId, { status: 'active' }),
    staleTime: 5 * 60_000,
  });

  const invalidateTutoring = () => {
    for (const key of [
      'tutoring-sessions',
      'tutoring-session-stats',
      'tutoring-queue',
      'tutoring-queue-summary',
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

  const queueCount = queueSummaryQuery.data?.count ?? 0;
  const sessions = sessionsQuery.data?.data ?? [];

  const prefillFromQueue = (item: TutoringQueueItem) => {
    // A group with a single manager has only one possible teacher, so assign it
    // now instead of leaving the prefilled form one required field short.
    const managerIds = (
      groupsQuery.data?.find((group) => group.id === item.group_id)?.managers ??
      []
    )
      .map((manager) => manager.id)
      .filter((id): id is string => Boolean(id));
    const teacherUserId = managerIds.length === 1 ? (managerIds[0] ?? '') : '';

    setForm((current) => ({
      ...current,
      content: item.feedback_content,
      groupId: item.group_id,
      reasonDetail: item.feedback_content,
      reasonType:
        item.reason_type === 'WEAK_SUPPORT'
          ? 'WEAK_SUPPORT'
          : 'ABSENT_RECOVERY',
      sessionSlots: Array.from(
        { length: Math.max(1, item.absence_deficit) },
        () => ({
          durationMinutes: 45,
          sessionDate: '',
          startTime: '18:00',
          teacherUserId,
        })
      ),
      sourceFeedbackId: item.source_feedback_id,
      studentLabel: item.student_name,
      studentUserId: item.student_user_id,
    }));
    setCreateDialogOpen(true);
    void setTab('sessions');
  };

  return (
    <main className="space-y-4 p-2 md:space-y-6 md:p-6">
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
          queue: queueSummaryQuery.data?.count,
          today: statQueries[0]?.data?.count,
        }}
        isLoading={
          statQueries.some((query) => query.isLoading) ||
          queueSummaryQuery.isLoading
        }
      />

      <Tabs
        className="space-y-4"
        onValueChange={(value) => void setTab(value)}
        value={tab === 'queue' ? 'queue' : 'sessions'}
      >
        <TabsList className="h-auto">
          <TabsTrigger className="gap-2" value="sessions">
            <CalendarClock className="h-4 w-4" />
            {t('sessions_tab')}
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="queue">
            <LifeBuoy className="h-4 w-4" />
            {t('queue_tab')}
            {queueCount > 0 ? (
              <Badge
                className="ml-1 rounded-full border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange"
                variant="outline"
              >
                {queueCount}
              </Badge>
            ) : null}
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
            isMarking={markMutation.isPending}
            locale={locale}
            pagination={{
              count: sessionsQuery.data?.count ?? 0,
              page: sessionsQuery.data?.page ?? sessionPage,
              pageSize: sessionsQuery.data?.pageSize ?? sessionPageSize,
            }}
            sessions={sessions}
            students={sessions
              .map((session) => session.student)
              .filter((student) => student !== null)}
            wsId={wsId}
          />
        </TabsContent>

        <TabsContent value="queue">
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
            filters={{
              groupId: queueGroupId,
              reasonType: queueReasonType,
              search: queueSearch,
              studentUserId: queueStudentId,
            }}
            groups={groupsQuery.data ?? []}
            pagination={{ page: queuePage, pageSize: queuePageSize }}
            wsId={wsId}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

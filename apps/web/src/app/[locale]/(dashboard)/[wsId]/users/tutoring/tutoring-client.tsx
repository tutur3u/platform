'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createTutoringSession,
  getNextWorkspaceUserGroupsPageParam,
  listTutoringQueue,
  listTutoringSessions,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
  markTutoringSession,
} from '@tuturuuu/internal-api';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { TutoringQueueCard } from './tutoring-queue-card';
import { TutoringSessionsCard } from './tutoring-sessions-card';
import { DEFAULT_FORM, type TutoringFormValues } from './tutoring-types';

interface Props {
  wsId: string;
  canManage: boolean;
}

export function TutoringClient({ wsId, canManage }: Props) {
  const t = useTranslations('ws-tutoring');
  const queryClient = useQueryClient();
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsString.withDefault('sessions').withOptions({ shallow: true })
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
  const [queueGroupSearch, setQueueGroupSearch] = useState('');
  const [queueStudentSearch, setQueueStudentSearch] = useState('');
  const [debouncedQueueGroupSearch] = useDebounce(queueGroupSearch, 250);
  const [debouncedQueueStudentSearch] = useDebounce(queueStudentSearch, 250);

  const sessionsQuery = useQuery({
    queryKey: [
      'tutoring-sessions',
      wsId,
      sessionReasonType,
      sessionAttendance,
      sessionGroupId,
      sessionStudentId,
      sessionPage,
      sessionPageSize,
    ],
    queryFn: () =>
      listTutoringSessions(wsId, {
        reasonType:
          sessionReasonType === 'all'
            ? undefined
            : (sessionReasonType as
                | 'ABSENT_RECOVERY'
                | 'WEAK_SUPPORT'
                | 'CUSTOM'),
        attendanceStatus:
          sessionAttendance === 'all'
            ? undefined
            : (sessionAttendance as
                | 'PENDING'
                | 'DONE'
                | 'NO_SHOW'
                | 'CANCELLED'),
        groupId: sessionGroupId === 'all' ? undefined : sessionGroupId,
        studentUserId:
          sessionStudentId === 'all' ? undefined : sessionStudentId,
        page: sessionPage,
        pageSize: sessionPageSize,
      }),
  });
  const queueQuery = useQuery({
    queryKey: [
      'tutoring-queue',
      wsId,
      queueReasonType,
      queueGroupId,
      queueStudentId,
      queuePage,
      queuePageSize,
    ],
    queryFn: () =>
      listTutoringQueue(wsId, {
        reasonType: queueReasonType === 'all' ? undefined : queueReasonType,
        groupId: queueGroupId === 'all' ? undefined : queueGroupId,
        studentUserId: queueStudentId === 'all' ? undefined : queueStudentId,
        page: queuePage,
        pageSize: queuePageSize,
      }),
    placeholderData: keepPreviousData,
  });
  const groupsQuery = useQuery({
    queryKey: ['tutoring-groups', wsId],
    queryFn: () =>
      listWorkspaceUserGroups(wsId, {
        status: 'active',
        page: 1,
        pageSize: 200,
      }).then((response) => response.data),
  });
  const studentsQuery = useQuery({
    queryKey: ['tutoring-students', wsId],
    queryFn: () => listWorkspaceBasicUsers(wsId, { limit: 200 }),
  });

  const queueFilterGroupsQuery = useInfiniteQuery({
    queryKey: ['tutoring-queue-filter-groups', wsId, debouncedQueueGroupSearch],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listWorkspaceUserGroups(wsId, {
        status: 'active',
        q: debouncedQueueGroupSearch || undefined,
        page: pageParam,
        pageSize: 20,
      }),
    getNextPageParam: (lastPage, allPages) =>
      getNextWorkspaceUserGroupsPageParam(lastPage, allPages),
  });

  const queueFilterStudentsQuery = useInfiniteQuery({
    queryKey: [
      'tutoring-queue-filter-students',
      wsId,
      debouncedQueueStudentSearch,
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listWorkspaceBasicUsers(wsId, {
        from: pageParam,
        limit: 20,
        q: debouncedQueueStudentSearch || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );
      if (loadedCount >= (lastPage.count ?? 0) || lastPage.data.length < 20) {
        return undefined;
      }

      return loadedCount;
    },
  });

  const queueFilterGroups = useMemo(
    () =>
      queueFilterGroupsQuery.data?.pages.flatMap((page) => page.data ?? []) ??
      [],
    [queueFilterGroupsQuery.data?.pages]
  );

  const queueFilterStudents = useMemo(
    () =>
      queueFilterStudentsQuery.data?.pages.flatMap((page) => page.data ?? []) ??
      [],
    [queueFilterStudentsQuery.data?.pages]
  );

  const queueRows = useMemo(() => {
    if (queueQuery.isLoading) return undefined;
    const rows = queueQuery.data?.data ?? [];
    const keyword = queueSearch.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((item) => {
      const haystack = [
        item.student_name,
        item.group_name,
        item.reason_type,
        item.feedback_content,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [queueQuery.data?.data, queueSearch, queueQuery.isLoading]);

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
        if (!slot.sessionDate || !slot.startTime) {
          throw new Error(t('missing_required'));
        }
        if (slot.durationMinutes < 1 || slot.durationMinutes > 480) {
          throw new Error(t('invalid_duration'));
        }
      }

      return createTutoringSession(wsId, {
        groupId: form.groupId,
        studentUserId: form.studentUserId,
        sessions: form.sessionSlots,
        reasonType: form.reasonType,
        reasonDetail: form.reasonDetail,
        content: form.content,
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
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-sessions', wsId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-queue', wsId],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-sessions', wsId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-queue', wsId],
      });
    },
  });

  return (
    <Tabs
      value={tab === 'queue' ? 'queue' : 'sessions'}
      onValueChange={(value) => void setTab(value)}
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="sessions">{t('sessions_tab')}</TabsTrigger>
        <TabsTrigger value="queue">{t('queue_tab')}</TabsTrigger>
      </TabsList>

      <TabsContent value="sessions" className="space-y-4">
        <TutoringSessionsCard
          canManage={canManage}
          sessions={sessionsQuery.data?.data ?? []}
          count={sessionsQuery.data?.count ?? 0}
          page={sessionsQuery.data?.page ?? sessionPage}
          pageSize={sessionsQuery.data?.pageSize ?? sessionPageSize}
          groups={groupsQuery.data ?? []}
          students={studentsQuery.data?.data ?? []}
          reasonType={sessionReasonType}
          attendanceStatus={sessionAttendance}
          groupId={sessionGroupId}
          studentUserId={sessionStudentId}
          createForm={form}
          isCreating={createMutation.isPending}
          createDialogOpen={createDialogOpen}
          onReasonTypeChange={(value) => {
            void setSessionReasonType(value);
            void setSessionPage(1);
          }}
          onAttendanceStatusChange={(value) => {
            void setSessionAttendance(value);
            void setSessionPage(1);
          }}
          onGroupIdChange={(value) => {
            void setSessionGroupId(value);
            void setSessionPage(1);
          }}
          onStudentUserIdChange={(value) => {
            void setSessionStudentId(value);
            void setSessionPage(1);
          }}
          onCreateFormChange={setForm}
          onCreate={() => createMutation.mutate()}
          onCreateDialogOpenChange={setCreateDialogOpen}
          onParamsChange={({ page, pageSize }) => {
            if (page) void setSessionPage(page);
            if (pageSize) void setSessionPageSize(Number(pageSize));
          }}
          onResetFilters={() => {
            void setSessionReasonType('all');
            void setSessionAttendance('all');
            void setSessionGroupId('all');
            void setSessionStudentId('all');
            void setSessionPage(1);
            void setSessionPageSize(20);
          }}
          isMarking={markMutation.isPending}
          onMark={(id, status) => markMutation.mutate({ id, status })}
        />
      </TabsContent>

      <TabsContent value="queue">
        <TutoringQueueCard
          canManage={canManage}
          queue={queueRows}
          count={queueQuery.data?.count ?? 0}
          page={queueQuery.data?.page ?? queuePage}
          pageSize={queueQuery.data?.pageSize ?? queuePageSize}
          groups={queueFilterGroups}
          students={queueFilterStudents}
          reasonType={queueReasonType}
          groupId={queueGroupId}
          studentUserId={queueStudentId}
          search={queueSearch}
          onGroupSearchChange={setQueueGroupSearch}
          onStudentSearchChange={setQueueStudentSearch}
          groupHasMore={Boolean(queueFilterGroupsQuery.hasNextPage)}
          studentHasMore={Boolean(queueFilterStudentsQuery.hasNextPage)}
          groupsLoadingMore={queueFilterGroupsQuery.isFetchingNextPage}
          studentsLoadingMore={queueFilterStudentsQuery.isFetchingNextPage}
          onLoadMoreGroups={() => {
            if (queueFilterGroupsQuery.hasNextPage) {
              void queueFilterGroupsQuery.fetchNextPage();
            }
          }}
          onLoadMoreStudents={() => {
            if (queueFilterStudentsQuery.hasNextPage) {
              void queueFilterStudentsQuery.fetchNextPage();
            }
          }}
          isFetching={queueQuery.isFetching && !queueQuery.isLoading}
          onReasonTypeChange={(value) => {
            void setQueueReasonType(value);
            void setQueuePage(1);
          }}
          onGroupIdChange={(value) => {
            void setQueueGroupId(value);
            void setQueueStudentId('all');
            void setQueuePage(1);
          }}
          onStudentUserIdChange={(value) => {
            void setQueueStudentId(value);
            void setQueuePage(1);
          }}
          onSearchChange={(value) => void setQueueSearch(value)}
          onParamsChange={({ page, pageSize }) => {
            if (page) void setQueuePage(page);
            if (pageSize) void setQueuePageSize(Number(pageSize));
          }}
          onResetFilters={() => {
            void setQueueReasonType('all');
            void setQueueGroupId('all');
            void setQueueStudentId('all');
            void setQueueSearch('');
            void setQueuePage(1);
            void setQueuePageSize(20);
          }}
          onActivate={(item) => {
            const nextReason =
              item.reason_type === 'WEAK_SUPPORT'
                ? 'WEAK_SUPPORT'
                : 'ABSENT_RECOVERY';
            setForm((current) => ({
              ...current,
              groupId: item.group_id,
              studentUserId: item.student_user_id,
              sessionSlots: Array.from(
                { length: Math.max(1, item.absence_deficit) },
                () => ({
                  sessionDate: '',
                  startTime: '18:00',
                  durationMinutes: 45,
                })
              ),
              reasonType: nextReason,
              reasonDetail: item.feedback_content,
              content: item.feedback_content,
            }));
            setCreateDialogOpen(true);
            void setTab('sessions');
          }}
        />
      </TabsContent>
    </Tabs>
  );
}

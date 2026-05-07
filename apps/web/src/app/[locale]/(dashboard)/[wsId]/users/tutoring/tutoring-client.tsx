'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTutoringSession,
  listAllWorkspaceUserGroups,
  listTutoringQueue,
  listTutoringSessions,
  listWorkspaceBasicUsers,
  markTutoringSession,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { TutoringCreateCard } from './tutoring-create-card';
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
  const [form, setForm] = useState<TutoringFormValues>(DEFAULT_FORM);

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
    ],
    queryFn: () =>
      listTutoringQueue(wsId, {
        reasonType: queueReasonType === 'all' ? undefined : queueReasonType,
        groupId: queueGroupId === 'all' ? undefined : queueGroupId,
        studentUserId: queueStudentId === 'all' ? undefined : queueStudentId,
      }),
  });
  const groupsQuery = useQuery({
    queryKey: ['tutoring-groups', wsId],
    queryFn: () => listAllWorkspaceUserGroups(wsId, { status: 'active' }),
  });
  const studentsQuery = useQuery({
    queryKey: ['tutoring-students', wsId],
    queryFn: () => listWorkspaceBasicUsers(wsId, { limit: 200 }),
  });

  const queueRows = useMemo(() => {
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
  }, [queueQuery.data?.data, queueSearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.groupId || !form.studentUserId || !form.sessionDate) {
        throw new Error(t('missing_required'));
      }
      return createTutoringSession(wsId, {
        groupId: form.groupId,
        studentUserId: form.studentUserId,
        sessionDate: form.sessionDate,
        startTime: form.startTime,
        reasonType: form.reasonType,
        reasonDetail: form.reasonDetail,
        content: form.content,
      });
    },
    onSuccess: () => {
      toast.success(t('created'));
      setForm(DEFAULT_FORM);
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
        {canManage ? (
          <TutoringCreateCard
            form={form}
            groups={groupsQuery.data ?? []}
            students={studentsQuery.data?.data ?? []}
            isSubmitting={createMutation.isPending}
            onChange={setForm}
            onSubmit={() => createMutation.mutate()}
          />
        ) : null}
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
          groups={groupsQuery.data ?? []}
          students={studentsQuery.data?.data ?? []}
          reasonType={queueReasonType}
          groupId={queueGroupId}
          studentUserId={queueStudentId}
          search={queueSearch}
          onReasonTypeChange={(value) => void setQueueReasonType(value)}
          onGroupIdChange={(value) => void setQueueGroupId(value)}
          onStudentUserIdChange={(value) => void setQueueStudentId(value)}
          onSearchChange={(value) => void setQueueSearch(value)}
          onResetFilters={() => {
            void setQueueReasonType('all');
            void setQueueGroupId('all');
            void setQueueStudentId('all');
            void setQueueSearch('');
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
              reasonType: nextReason,
              reasonDetail: item.feedback_content,
            }));
            void setTab('sessions');
          }}
        />
      </TabsContent>
    </Tabs>
  );
}

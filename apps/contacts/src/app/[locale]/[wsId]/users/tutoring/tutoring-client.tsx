'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTutoringSession,
  listAllWorkspaceUserGroups,
  listTutoringSessions,
  listWorkspaceBasicUsers,
  markTutoringSession,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useState } from 'react';
import { TutoringQueueCard } from './tutoring-queue-card';
import { TutoringSessionsCard } from './tutoring-sessions-card';
import {
  DEFAULT_FORM,
  findSessionSlotConflicts,
  type TutoringFormValues,
} from './tutoring-types';

async function listAllWorkspaceBasicUsers(wsId: string) {
  const users: WorkspaceBasicUserRecord[] = [];
  const pageSize = 200;

  for (let from = 0; ; from += pageSize) {
    const response = await listWorkspaceBasicUsers(wsId, {
      from,
      limit: pageSize,
    });
    users.push(...response.data);

    if (response.data.length < pageSize || users.length >= response.count) {
      return {
        count: users.length,
        data: users,
      };
    }
  }
}

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
  const groupsQuery = useQuery({
    queryKey: ['tutoring-groups', wsId],
    queryFn: () =>
      listAllWorkspaceUserGroups(wsId, {
        status: 'active',
      }),
  });
  const studentsQuery = useQuery({
    queryKey: ['tutoring-students', wsId],
    queryFn: () => listAllWorkspaceBasicUsers(wsId),
  });

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

      const slotConflicts = findSessionSlotConflicts(form);
      if (slotConflicts.length > 0) {
        const firstConflict = slotConflicts[0];
        const slotA = (firstConflict?.firstIndex ?? 0) + 1;
        const slotB = (firstConflict?.secondIndex ?? 0) + 1;
        if (firstConflict?.conflictType === 'teacher') {
          throw new Error(t('conflict_teacher_slots', { slotA, slotB }));
        }

        throw new Error(t('conflict_student_slots', { slotA, slotB }));
      }

      return createTutoringSession(wsId, {
        groupId: form.groupId,
        studentUserId: form.studentUserId,
        sessions: form.sessionSlots,
        reasonType: form.reasonType,
        reasonDetail: form.reasonDetail,
        content: form.content,
        sourceFeedbackId: form.sourceFeedbackId ?? null,
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
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('mark_failed'));
    },
  });

  const sessionsProps = {
    filters: {
      reasonType: sessionReasonType,
      attendanceStatus: sessionAttendance,
      groupId: sessionGroupId,
      studentUserId: sessionStudentId,
    },
    create: {
      form,
      isSubmitting: createMutation.isPending,
      open: createDialogOpen,
    },
    pagination: {
      count: sessionsQuery.data?.count ?? 0,
      page: sessionsQuery.data?.page ?? sessionPage,
      pageSize: sessionsQuery.data?.pageSize ?? sessionPageSize,
    },
  };

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
          wsId={wsId}
          canManage={canManage}
          sessions={sessionsQuery.data?.data ?? []}
          groups={groupsQuery.data ?? []}
          students={studentsQuery.data?.data ?? []}
          filters={sessionsProps.filters}
          create={sessionsProps.create}
          pagination={sessionsProps.pagination}
          isMarking={markMutation.isPending}
          actions={{
            onReasonTypeChange: (value) => {
              void setSessionReasonType(value);
              void setSessionPage(1);
            },
            onAttendanceStatusChange: (value) => {
              void setSessionAttendance(value);
              void setSessionPage(1);
            },
            onGroupIdChange: (value) => {
              void setSessionGroupId(value);
              void setSessionPage(1);
            },
            onStudentUserIdChange: (value) => {
              void setSessionStudentId(value);
              void setSessionPage(1);
            },
            onCreateFormChange: setForm,
            onCreate: () => createMutation.mutate(),
            onCreateDialogOpenChange: setCreateDialogOpen,
            onParamsChange: ({ page, pageSize }) => {
              if (page) void setSessionPage(page);
              if (pageSize) void setSessionPageSize(Number(pageSize));
            },
            onResetFilters: () => {
              void setSessionReasonType('all');
              void setSessionAttendance('all');
              void setSessionGroupId('all');
              void setSessionStudentId('all');
              void setSessionPage(1);
              void setSessionPageSize(20);
            },
            onMark: (id, status) => markMutation.mutate({ id, status }),
          }}
        />
      </TabsContent>

      <TabsContent value="queue">
        <TutoringQueueCard
          wsId={wsId}
          canManage={canManage}
          enabled={tab === 'queue'}
          filters={{
            reasonType: queueReasonType,
            groupId: queueGroupId,
            studentUserId: queueStudentId,
            search: queueSearch,
          }}
          pagination={{
            page: queuePage,
            pageSize: queuePageSize,
          }}
          lookup={{
            groups: groupsQuery.data ?? [],
            students: studentsQuery.data?.data ?? [],
          }}
          actions={{
            onReasonTypeChange: (value) => {
              void setQueueReasonType(value);
              void setQueuePage(1);
            },
            onGroupIdChange: (value) => {
              void setQueueGroupId(value);
              void setQueueStudentId('all');
              void setQueuePage(1);
            },
            onStudentUserIdChange: (value) => {
              void setQueueStudentId(value);
              void setQueuePage(1);
            },
            onSearchChange: (value) => void setQueueSearch(value),
            onParamsChange: ({ page, pageSize }) => {
              if (page) void setQueuePage(page);
              if (pageSize) void setQueuePageSize(Number(pageSize));
            },
            onResetFilters: () => {
              void setQueueReasonType('all');
              void setQueueGroupId('all');
              void setQueueStudentId('all');
              void setQueueSearch('');
              void setQueuePage(1);
              void setQueuePageSize(20);
            },
            onActivate: (item) => {
              const nextReason =
                item.reason_type === 'WEAK_SUPPORT'
                  ? 'WEAK_SUPPORT'
                  : 'ABSENT_RECOVERY';
              setForm((current) => ({
                ...current,
                groupId: item.group_id,
                studentUserId: item.student_user_id,
                studentLabel: item.student_name,
                sourceFeedbackId: item.source_feedback_id,
                sessionSlots: Array.from(
                  { length: Math.max(1, item.absence_deficit) },
                  () => ({
                    sessionDate: '',
                    startTime: '18:00',
                    durationMinutes: 45,
                    teacherUserId: '',
                  })
                ),
                reasonType: nextReason,
                reasonDetail: item.feedback_content,
                content: item.feedback_content,
              }));
              setCreateDialogOpen(true);
              void setTab('sessions');
            },
          }}
        />
      </TabsContent>
    </Tabs>
  );
}

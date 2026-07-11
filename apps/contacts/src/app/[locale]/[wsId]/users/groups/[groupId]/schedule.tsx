'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import {
  createWorkspaceUserGroupSession,
  listWorkspaceUserGroupSessions,
  repairWorkspaceUserGroupSessionOccurrence,
  updateWorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import '@tuturuuu/users-core/lib/dayjs-setup';
import { SessionEditorDialog } from '../_components/session-editor-dialog';
import { SessionScopeDialog } from '../_components/session-scope-dialog';
import { CompactScheduleActions } from './_components/compact-schedule-actions';
import { CompactScheduleDay } from './_components/compact-schedule-day';
import {
  buildMoveSessionPayload,
  type CompactScheduleData,
  compactDraftForDate,
  compactScheduleBuckets,
  compactScheduleMonthDays,
  compactScheduleMonthRange,
  compactScheduleQueryKey,
  type DraftSession,
  normalizeCompactScheduleMonth,
  optimisticCompactSchedulePatch,
  removeCompactMissingOccurrence,
  upsertCompactScheduleSessions,
} from './_components/compact-schedule-utils';
import { GroupSectionCard } from './_components/group-section-card';

type PendingUpdate = {
  payload: UpdateWorkspaceUserGroupSessionPayload;
  session: WorkspaceUserGroupSession;
};

export default function GroupSchedule({
  wsId,
  groupId,
  canUpdateUserGroups = false,
  initialMonth,
  initialSchedule,
}: {
  wsId: string;
  groupId: string;
  canUpdateUserGroups?: boolean;
  initialMonth?: string | null;
  initialSchedule?: CompactScheduleData | null;
}) {
  const locale = useLocale();
  const t = useTranslations('ws-user-group-schedule');
  const detailsT = useTranslations('ws-user-group-details');
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(() =>
    normalizeCompactScheduleMonth(initialMonth ?? initialSchedule?.month)
  );
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const [editingSession, setEditingSession] =
    useState<WorkspaceUserGroupSession | null>(null);
  const [moveSource, setMoveSource] =
    useState<WorkspaceUserGroupSession | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(
    null
  );

  const range = useMemo(
    () => compactScheduleMonthRange(currentMonth),
    [currentMonth]
  );
  const queryKey = compactScheduleQueryKey(wsId, groupId, range);
  const initialData =
    initialSchedule?.range.from === range.from &&
    initialSchedule.range.to === range.to
      ? initialSchedule
      : undefined;

  const scheduleQuery = useQuery<CompactScheduleData>({
    queryKey,
    queryFn: async () => {
      const response = await listWorkspaceUserGroupSessions(wsId, {
        from: range.from,
        groupId,
        includeMissing: true,
        to: range.to,
      });

      return {
        ...response,
        ending_date: initialSchedule?.ending_date ?? null,
        month: range.month,
        range,
        starting_date: initialSchedule?.starting_date ?? null,
      };
    },
    initialData,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const scheduleData = scheduleQuery.data;
  const groups = scheduleData?.groups?.length
    ? scheduleData.groups
    : [{ id: groupId, name: scheduleData?.data[0]?.groupName ?? t('group') }];
  const days = useMemo(
    () => compactScheduleMonthDays(currentMonth),
    [currentMonth]
  );
  const buckets = useMemo(
    () =>
      compactScheduleBuckets(
        scheduleData?.data ?? [],
        scheduleData?.missing ?? []
      ),
    [scheduleData?.data, scheduleData?.missing]
  );

  const createMutation = useMutation({
    mutationFn: (payload: CreateWorkspaceUserGroupSessionPayload) =>
      createWorkspaceUserGroupSession(wsId, payload),
    onError: () => toast.error(t('failed_to_save_session')),
    onSuccess: (response, payload) => {
      if (response.data) {
        queryClient.setQueryData<CompactScheduleData>(queryKey, (current) =>
          upsertCompactScheduleSessions(current, response.data!)
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ['group-schedule', payload.groupId],
      });
      toast.success(t('session_saved'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-user-group-sessions', wsId],
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      payload,
      sessionId,
    }: {
      payload: UpdateWorkspaceUserGroupSessionPayload;
      sessionId: string;
    }) => updateWorkspaceUserGroupSession(wsId, sessionId, payload),
    onMutate: async ({ payload, sessionId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CompactScheduleData>(queryKey);
      queryClient.setQueryData<CompactScheduleData>(queryKey, (current) =>
        optimisticCompactSchedulePatch(current, sessionId, payload)
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(t('failed_to_save_session'));
    },
    onSuccess: (response) => {
      if (response.data) {
        queryClient.setQueryData<CompactScheduleData>(queryKey, (current) =>
          upsertCompactScheduleSessions(current, response.data!)
        );
      }
      toast.success(t('session_saved'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-user-group-sessions', wsId],
      });
    },
  });

  const repairMutation = useMutation({
    mutationFn: (occurrence: WorkspaceUserGroupMissingSessionOccurrence) =>
      repairWorkspaceUserGroupSessionOccurrence(wsId, {
        date: occurrence.date,
        groupId: occurrence.groupId,
        seriesId: occurrence.seriesId,
      }),
    onError: () => toast.error(t('failed_to_add_missing_session')),
    onSuccess: (response, occurrence) => {
      queryClient.setQueryData<CompactScheduleData>(queryKey, (current) =>
        response.data
          ? upsertCompactScheduleSessions(
              removeCompactMissingOccurrence(current, occurrence),
              response.data
            )
          : current
      );
      toast.success(t('missing_session_added'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-user-group-sessions', wsId],
      });
    },
  });

  const currentMonthDate = dayjs(`${currentMonth}-01`, 'YYYY-MM-DD');
  const previousMonth = currentMonthDate.subtract(1, 'month').format('YYYY-MM');
  const nextMonth = currentMonthDate.add(1, 'month').format('YYYY-MM');
  const fullScheduleHref = `/${wsId}/users/groups/${groupId}/schedule`;

  const handleMoveHere = (date: string) => {
    if (!moveSource) return;
    const payload = buildMoveSessionPayload(moveSource, date);
    if (moveSource.seriesId) {
      setPendingUpdate({ payload, session: moveSource });
      return;
    }

    updateMutation.mutate({
      payload: { ...payload, scope: 'once' },
      sessionId: moveSource.id,
    });
    setMoveSource(null);
  };

  return (
    <GroupSectionCard
      accent="blue"
      icon={<CalendarDays className="h-5 w-5" />}
      title={detailsT('schedule')}
      description={currentMonthDate.locale(locale).format('MMMM YYYY')}
      action={
        <CompactScheduleActions
          canUpdateUserGroups={canUpdateUserGroups}
          createPending={createMutation.isPending}
          fullScheduleHref={fullScheduleHref}
          groupId={groupId}
          groups={groups}
          onCreate={async (payload) => {
            await createMutation.mutateAsync(payload);
          }}
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setCurrentMonth(previousMonth)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setCurrentMonth(nextMonth)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void scheduleQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            {t('refresh_sessions')}
          </Button>
        </div>
        {moveSource ? (
          <Badge variant="outline" className="gap-1">
            {t('move_mode_active')}
            <Button
              aria-label={t('cancel_move_mode')}
              className="h-5 w-5"
              size="icon"
              variant="ghost"
              onClick={() => setMoveSource(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-1.5 text-xs">
        <div className="grid grid-cols-7 gap-1.5">
          {days.slice(0, 7).map((day) => (
            <div
              key={`weekday-${day.key}`}
              className="flex h-8 items-center justify-center rounded-md bg-foreground/5 font-semibold text-muted-foreground"
            >
              {day.date.toLocaleString(locale, { weekday: 'narrow' })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => (
            <CompactScheduleDay
              key={day.key}
              bucket={buckets.get(day.key)}
              canUpdate={canUpdateUserGroups}
              currentMonth={currentMonth}
              day={day}
              fullScheduleHref={fullScheduleHref}
              locale={locale}
              moveSource={moveSource}
              onAddSession={(date) =>
                setDraftSession(compactDraftForDate(date))
              }
              onEditSession={setEditingSession}
              onMoveHere={handleMoveHere}
              onMoveSession={setMoveSource}
              onRepairMissing={(occurrence) =>
                repairMutation.mutate(occurrence)
              }
            />
          ))}
        </div>
      </div>

      <SessionEditorDialog
        canChooseGroup={false}
        defaultEndsAt={draftSession?.endsAt}
        defaultGroupId={groupId}
        defaultStartsAt={draftSession?.startsAt}
        groups={groups}
        isPending={createMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setDraftSession(null);
        }}
        onSubmit={async (payload) => {
          await createMutation.mutateAsync({
            ...(payload as CreateWorkspaceUserGroupSessionPayload),
            groupId,
          });
        }}
        open={!!draftSession}
        trigger={null}
        wsId={wsId}
      />

      <SessionEditorDialog
        canChooseGroup={false}
        defaultGroupId={groupId}
        groups={groups}
        isPending={updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setEditingSession(null);
        }}
        onSubmit={async (payload) => {
          if (!editingSession) return;
          await updateMutation.mutateAsync({
            payload: payload as UpdateWorkspaceUserGroupSessionPayload,
            sessionId: editingSession.id,
          });
        }}
        open={!!editingSession}
        session={editingSession}
        trigger={null}
        wsId={wsId}
      />

      <SessionScopeDialog
        open={!!pendingUpdate}
        onOpenChange={(open) => {
          if (!open) setPendingUpdate(null);
        }}
        onSelect={(scope) => {
          if (!pendingUpdate) return;
          updateMutation.mutate({
            payload: { ...pendingUpdate.payload, scope },
            sessionId: pendingUpdate.session.id,
          });
          setPendingUpdate(null);
          setMoveSource(null);
        }}
      />
    </GroupSectionCard>
  );
}

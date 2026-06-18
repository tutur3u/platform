'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  ListWorkspaceUserGroupSessionsResponse,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import {
  createWorkspaceUserGroupSession,
  listWorkspaceUserGroupSessions,
  updateWorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import '@/lib/dayjs-setup';
import { SessionCalendarGrid } from './session-calendar-grid';
import { SessionCalendarToolbar } from './session-calendar-toolbar';
import { SessionEditorDialog } from './session-editor-dialog';
import { SessionScopeDialog } from './session-scope-dialog';
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  getTimeSlots,
  getWeekDays,
  getWeekStart,
  moveSessionToSlot,
  resizeSessionByMinutes,
  sessionSlotKey,
} from './session-time-utils';

type PendingUpdate = {
  payload: UpdateWorkspaceUserGroupSessionPayload;
  session: WorkspaceUserGroupSession;
};

interface UserGroupSessionCalendarProps {
  canChooseGroup?: boolean;
  canUpdateSchedule: boolean;
  groupId?: string;
  title?: string;
  wsId: string;
}

function scheduleQueryKey(
  wsId: string,
  weekStart: Date,
  groupId?: string | null
) {
  return [
    'workspace-user-group-sessions',
    wsId,
    dayjs(weekStart).format('YYYY-MM-DD'),
    groupId ?? 'all',
  ] as const;
}

function optimisticPatch(
  data: ListWorkspaceUserGroupSessionsResponse | undefined,
  sessionId: string,
  payload: UpdateWorkspaceUserGroupSessionPayload
) {
  if (!data) return data;

  return {
    ...data,
    data: data.data.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            description:
              payload.description === undefined
                ? session.description
                : payload.description,
            endTimezone: payload.endTimezone ?? session.endTimezone,
            endsAt: payload.endsAt ?? session.endsAt,
            startTimezone: payload.startTimezone ?? session.startTimezone,
            startsAt: payload.startsAt ?? session.startsAt,
            title: payload.title === undefined ? session.title : payload.title,
          }
        : session
    ),
  };
}

function upsertSessions(
  data: ListWorkspaceUserGroupSessionsResponse | undefined,
  incoming: WorkspaceUserGroupSession | WorkspaceUserGroupSession[]
) {
  if (!data) return data;
  const rows = Array.isArray(incoming) ? incoming : [incoming];
  const byId = new Map(data.data.map((session) => [session.id, session]));
  for (const row of rows) byId.set(row.id, row);
  return {
    ...data,
    data: Array.from(byId.values()).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt)
    ),
  };
}

function withSessionRelations(
  session: WorkspaceUserGroupSession,
  payload: UpdateWorkspaceUserGroupSessionPayload
): UpdateWorkspaceUserGroupSessionPayload {
  return {
    ...payload,
    files:
      payload.files ??
      session.files.map((file) => ({
        name: file.name,
        storagePath: file.storagePath,
      })),
    tagNames: payload.tagNames ?? session.tags.map((tag) => tag.name),
  };
}

export function UserGroupSessionCalendar({
  canChooseGroup = false,
  canUpdateSchedule,
  groupId,
  title,
  wsId,
}: UserGroupSessionCalendarProps) {
  const t = useTranslations('ws-user-group-schedule');
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [groupFilter, setGroupFilter] = useState(groupId ?? 'all');
  const [tagFilter, setTagFilter] = useState('all');
  const [timezone, setTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE);
  const [editingSession, setEditingSession] =
    useState<WorkspaceUserGroupSession | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(
    null
  );

  const activeGroupId = groupId ?? (groupFilter === 'all' ? null : groupFilter);
  const queryKey = scheduleQueryKey(wsId, weekStart, activeGroupId);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const slots = useMemo(() => getTimeSlots(), []);
  const range = useMemo(
    () => ({
      from: dayjs(weekStart).startOf('day').toISOString(),
      to: dayjs(weekStart).add(7, 'day').startOf('day').toISOString(),
    }),
    [weekStart]
  );

  const sessionsQuery = useQuery({
    queryKey,
    queryFn: () =>
      listWorkspaceUserGroupSessions(wsId, {
        from: range.from,
        groupId: activeGroupId ?? undefined,
        to: range.to,
      }),
  });

  const scheduleData = sessionsQuery.data;
  const groups = scheduleData?.groups ?? [];
  const tags = scheduleData?.tags ?? [];

  const filteredSessions = useMemo(() => {
    return (scheduleData?.data ?? []).filter((session) => {
      if (tagFilter === 'all') return true;
      return session.tags.some((tag) => tag.id === tagFilter);
    });
  }, [scheduleData?.data, tagFilter]);

  const sessionsBySlot = useMemo(() => {
    const map = new Map<string, WorkspaceUserGroupSession[]>();
    for (const session of filteredSessions) {
      const key = sessionSlotKey(session);
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    return map;
  }, [filteredSessions]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateWorkspaceUserGroupSessionPayload) =>
      createWorkspaceUserGroupSession(wsId, payload),
    onError: () => toast.error(t('failed_to_save_session')),
    onSuccess: (response) => {
      if (response.data) {
        queryClient.setQueryData<ListWorkspaceUserGroupSessionsResponse>(
          queryKey,
          (current) => upsertSessions(current, response.data!)
        );
      }
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('session_saved'));
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
      const previous =
        queryClient.getQueryData<ListWorkspaceUserGroupSessionsResponse>(
          queryKey
        );
      queryClient.setQueryData<ListWorkspaceUserGroupSessionsResponse>(
        queryKey,
        (current) => optimisticPatch(current, sessionId, payload)
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(t('failed_to_save_session'));
    },
    onSuccess: (response) => {
      if (response.data) {
        queryClient.setQueryData<ListWorkspaceUserGroupSessionsResponse>(
          queryKey,
          (current) => upsertSessions(current, response.data!)
        );
      }
      toast.success(t('session_saved'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const requestUpdate = (
    session: WorkspaceUserGroupSession,
    payload: UpdateWorkspaceUserGroupSessionPayload
  ) => {
    if (session.seriesId && !payload.scope) {
      setPendingUpdate({ payload, session });
      return;
    }

    updateMutation.mutate({
      payload: { ...payload, scope: payload.scope ?? 'once' },
      sessionId: session.id,
    });
  };

  const handleDrop = (date: string, time: string, sessionId: string) => {
    const session = filteredSessions.find((item) => item.id === sessionId);
    if (!session || !canUpdateSchedule) return;
    const moved = moveSessionToSlot(session, date, time);
    requestUpdate(session, {
      ...moved,
      endTimezone: session.endTimezone,
      startTimezone: session.startTimezone,
    });
  };

  return (
    <div className="space-y-4">
      <SessionCalendarToolbar
        activeGroupId={activeGroupId}
        canChooseGroup={canChooseGroup}
        canUpdateSchedule={canUpdateSchedule}
        createPending={createMutation.isPending}
        groupFilter={groupFilter}
        groups={groups}
        onCreate={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
        onGroupFilterChange={setGroupFilter}
        onRefresh={() => {
          void sessionsQuery.refetch();
        }}
        onTagFilterChange={setTagFilter}
        onTimezoneChange={setTimezone}
        onWeekStartChange={setWeekStart}
        tagFilter={tagFilter}
        tags={tags}
        timezone={timezone}
        title={title}
        weekStart={weekStart}
      />

      <SessionCalendarGrid
        canUpdateSchedule={canUpdateSchedule}
        days={days}
        onDrop={handleDrop}
        onEdit={setEditingSession}
        onResize={(item, minutes) =>
          requestUpdate(item, {
            endTimezone: item.endTimezone,
            endsAt: resizeSessionByMinutes(item, minutes),
          })
        }
        sessionsBySlot={sessionsBySlot}
        slots={slots}
        timezone={timezone}
      />

      <SessionEditorDialog
        canChooseGroup={canChooseGroup}
        defaultGroupId={activeGroupId ?? undefined}
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
      />

      <SessionScopeDialog
        open={!!pendingUpdate}
        onOpenChange={(open) => {
          if (!open) setPendingUpdate(null);
        }}
        onSelect={(scope) => {
          if (!pendingUpdate) return;
          updateMutation.mutate({
            payload: {
              ...withSessionRelations(
                pendingUpdate.session,
                pendingUpdate.payload
              ),
              scope,
            },
            sessionId: pendingUpdate.session.id,
          });
          setPendingUpdate(null);
        }}
      />
    </div>
  );
}

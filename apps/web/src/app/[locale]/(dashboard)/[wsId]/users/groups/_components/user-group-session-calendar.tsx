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
import type { Workspace } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { CalendarEventAdapter } from '@tuturuuu/ui/hooks/use-calendar';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import '@/lib/dayjs-setup';
import { SessionCalendarToolbar } from './session-calendar-toolbar';
import { SessionEditorDialog } from './session-editor-dialog';
import { SessionScopeDialog } from './session-scope-dialog';
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  formatSessionTime,
  getWeekStart,
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
  range: { from: string; to: string },
  groupId?: string | null
) {
  return [
    'workspace-user-group-sessions',
    wsId,
    range.from,
    range.to,
    groupId ?? 'all',
  ] as const;
}

function calendarQueryRange(date: Date, view: CalendarView) {
  if (view === 'day') {
    return {
      from: dayjs(date).startOf('day').toISOString(),
      to: dayjs(date).add(1, 'day').startOf('day').toISOString(),
    };
  }

  if (view === '4-days') {
    return {
      from: dayjs(date).startOf('day').toISOString(),
      to: dayjs(date).add(4, 'day').startOf('day').toISOString(),
    };
  }

  if (view === 'month') {
    return {
      from: dayjs(date).startOf('month').subtract(7, 'day').toISOString(),
      to: dayjs(date).endOf('month').add(7, 'day').toISOString(),
    };
  }

  if (view === 'agenda') {
    return {
      from: dayjs(date).startOf('day').toISOString(),
      to: dayjs(date).add(30, 'day').endOf('day').toISOString(),
    };
  }

  const weekStart = getWeekStart(date);
  return {
    from: dayjs(weekStart).startOf('day').toISOString(),
    to: dayjs(weekStart).add(7, 'day').startOf('day').toISOString(),
  };
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
            descriptionJson:
              payload.descriptionJson === undefined
                ? session.descriptionJson
                : payload.descriptionJson,
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
  const calendarT = useTranslations('calendar');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [groupFilter, setGroupFilter] = useState(groupId ?? 'all');
  const [tagFilter, setTagFilter] = useState('all');
  const [timezone, setTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE);
  const [editingSession, setEditingSession] =
    useState<WorkspaceUserGroupSession | null>(null);
  const [draftEvent, setDraftEvent] = useState<CalendarEvent | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(
    null
  );

  const activeGroupId = groupId ?? (groupFilter === 'all' ? null : groupFilter);
  const weekStart = useMemo(() => getWeekStart(calendarDate), [calendarDate]);
  const range = useMemo(
    () => calendarQueryRange(calendarDate, calendarView),
    [calendarDate, calendarView]
  );
  const queryKey = scheduleQueryKey(wsId, range, activeGroupId);

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

  const sessionsById = useMemo(
    () =>
      new Map(
        (scheduleData?.data ?? []).map((session) => [session.id, session])
      ),
    [scheduleData?.data]
  );

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    return filteredSessions.map((session) => {
      const tags = session.tags.map((tag) => tag.name).join(', ');
      const badges = [
        session.seriesId ? t('recurring_badge') : null,
        tags || null,
        session.files.length
          ? t('files_attached_count', { count: session.files.length })
          : null,
      ].filter(Boolean);
      const titleParts = [
        session.title || session.groupName || t('untitled_session'),
        badges.length ? badges.join(' / ') : null,
      ].filter(Boolean);

      return {
        id: session.id,
        title: titleParts.join(' - '),
        description: [
          formatSessionTime(session),
          session.groupName,
          session.description,
        ]
          .filter(Boolean)
          .join('\n'),
        start_at: session.startsAt,
        end_at: session.endsAt,
        color: session.seriesId
          ? 'PURPLE'
          : session.tags.length
            ? 'GREEN'
            : 'BLUE',
        locked: false,
        ws_id: wsId,
      };
    });
  }, [filteredSessions, t, wsId]);

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

  const requestUpdate = useCallback(
    (
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
    },
    [updateMutation]
  );

  const eventAdapter = useMemo<CalendarEventAdapter>(
    () => ({
      disableBuiltInEventUi: true,
      onCreate: (event) => {
        if (!canUpdateSchedule) return undefined;
        setDraftEvent({ id: 'new', ...event });
        return undefined;
      },
      onCreateDraft: (event) => {
        if (!canUpdateSchedule) return;
        setDraftEvent(event);
      },
      onOpen: (eventId, event) => {
        if (!eventId || eventId === 'new') {
          if (canUpdateSchedule) setDraftEvent(event ?? null);
          return;
        }

        const session = sessionsById.get(eventId);
        if (session) setEditingSession(session);
      },
      onUpdate: (eventId, updates, event) => {
        if (!canUpdateSchedule) return event;

        const session = sessionsById.get(eventId);
        if (!session) return event;

        const payload: UpdateWorkspaceUserGroupSessionPayload = {
          endTimezone: session.endTimezone,
          startTimezone: session.startTimezone,
        };

        if (updates.start_at) payload.startsAt = updates.start_at;
        if (updates.end_at) payload.endsAt = updates.end_at;
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.description !== undefined) {
          payload.description = updates.description;
        }

        requestUpdate(session, payload);

        return event ? { ...event, ...updates } : undefined;
      },
      onDelete: () => {
        toast.info(t('delete_session_not_available'));
      },
    }),
    [canUpdateSchedule, sessionsById, t, requestUpdate]
  );

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-4">
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
        onWeekStartChange={setCalendarDate}
        tagFilter={tagFilter}
        tags={tags}
        timezone={timezone}
        title={title}
        weekStart={weekStart}
        wsId={wsId}
      />

      <div className="min-h-[720px] flex-1 overflow-hidden rounded-md border bg-background">
        <SmartCalendar
          t={calendarT}
          locale={locale}
          workspace={{ id: wsId } as Workspace}
          useQuery={useQuery}
          useQueryClient={useQueryClient}
          disabled={!canUpdateSchedule}
          eventAdapter={eventAdapter}
          externalEvents={calendarEvents}
          externalEventsLoading={sessionsQuery.isLoading}
          externalEventsRefresh={() => {
            void sessionsQuery.refetch();
          }}
          externalState={{
            date: calendarDate,
            setDate: setCalendarDate,
            view: calendarView,
            setView: setCalendarView,
            availableViews: [
              { value: 'day', label: calendarT('day') },
              { value: '4-days', label: calendarT('4-days') },
              { value: 'week', label: calendarT('week') },
              { value: 'month', label: calendarT('month') },
              { value: 'agenda', label: calendarT('agenda') },
            ],
          }}
          showConnectionsManager={false}
        />
      </div>

      <SessionEditorDialog
        canChooseGroup={canChooseGroup}
        defaultEndsAt={draftEvent?.end_at}
        defaultGroupId={activeGroupId ?? undefined}
        defaultStartsAt={draftEvent?.start_at}
        groups={groups}
        isPending={createMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setDraftEvent(null);
        }}
        onSubmit={async (payload) => {
          await createMutation.mutateAsync(
            payload as CreateWorkspaceUserGroupSessionPayload
          );
        }}
        open={!!draftEvent}
        trigger={null}
        wsId={wsId}
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

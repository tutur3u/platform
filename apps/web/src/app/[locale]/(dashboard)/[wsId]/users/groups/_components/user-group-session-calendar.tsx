'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Clock, Edit, Repeat } from '@tuturuuu/icons';
import type {
  CreateWorkspaceUserGroupSessionPayload,
  ListWorkspaceUserGroupSessionsResponse,
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupSession,
  WorkspaceUserGroupSessionReconciliationPreview,
} from '@tuturuuu/internal-api';
import {
  createWorkspaceUserGroupSession,
  InternalApiError,
  listWorkspaceUserGroupSessions,
  previewWorkspaceUserGroupSessionReconciliation,
  reconcileWorkspaceUserGroupSession,
  updateWorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@tuturuuu/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type { CalendarEventAdapter } from '@tuturuuu/ui/hooks/use-calendar';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@/lib/dayjs-setup';
import { SessionCalendarToolbar } from './session-calendar-toolbar';
import { SessionEditorDialog } from './session-editor-dialog';
import { SessionScopeDialog } from './session-scope-dialog';
import { DEFAULT_SCHEDULE_TIMEZONE, getWeekStart } from './session-time-utils';

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

const scheduleMessageFallbacks = {
  confirm_fix_recurring_link: 'Attach to recurring schedule',
  confirm_fix_recurring_link_convert_weekly: 'Create weekly series',
  confirm_fix_recurring_link_snap: 'Move back and attach',
  confirm_fix_recurring_link_weekly: 'Add weekday and attach',
  detached_session: 'Detached session',
  failed_to_fix_recurring_link: 'Failed to fix recurring link',
  fix_recurring_link: 'Fix recurring link',
  fix_recurring_link_description:
    'Attach this detached session back to a recurring schedule, or convert it into a weekly schedule when no match exists.',
  fix_recurring_preview_description:
    'Review the matching recurring occurrence before attaching this session.',
  fix_recurring_preview_title: 'Fix recurring link',
  matching_recurring_occurrence: 'Matching recurring occurrence',
  new_weekly_recurring_schedule: 'New weekly recurring schedule',
  no_matching_recurring_schedule: 'No matching recurring schedule found',
  recurring_repair_adds_weekday:
    'This will add this weekday back to the recurring weekly schedule and attach the session. Future matching dates will follow the repaired pattern.',
  recurring_repair_creates_weekly_series:
    'No matching recurring schedule was found. This will create a weekly recurring schedule from this session and use this session as the first occurrence.',
  recurring_repair_exact_session:
    'This session already matches the recurring timeblock. It will be attached without changing its time.',
  recurring_repair_moves_session:
    'This will move the detached session back to the recurring timeblock and attach it to the series.',
  recurring_link_fixed: 'Recurring link fixed',
} as const;

type ScheduleMessageKey = keyof typeof scheduleMessageFallbacks;

function readScheduleMessage(
  messages: unknown,
  key: ScheduleMessageKey
): string {
  if (messages && typeof messages === 'object') {
    const namespace = (messages as Record<string, unknown>)[
      'ws-user-group-schedule'
    ];
    if (namespace && typeof namespace === 'object') {
      const value = (namespace as Record<string, unknown>)[key];
      if (typeof value === 'string') return value;
    }
  }

  return scheduleMessageFallbacks[key];
}

function formatSessionPreviewRange(
  session: Pick<
    WorkspaceUserGroupSession,
    'endTimezone' | 'endsAt' | 'startTimezone' | 'startsAt'
  >,
  locale: string
) {
  const startTimezone = session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE;
  const endTimezone = session.endTimezone || startTimezone;
  const start = dayjs(session.startsAt).tz(startTimezone).locale(locale);
  const end = dayjs(session.endsAt).tz(endTimezone).locale(locale);
  const endFormat = start.isSame(end, 'day') ? 'HH:mm' : 'ddd, MMM D, HH:mm';

  return `${start.format('ddd, MMM D, HH:mm')} - ${end.format(endFormat)} ${startTimezone}`;
}

function formatOccurrencePreviewRange(
  occurrence: WorkspaceUserGroupSessionReconciliationPreview['occurrence'],
  locale: string
) {
  return formatSessionPreviewRange(
    {
      endTimezone: occurrence.endTimezone,
      endsAt: occurrence.endsAt,
      startTimezone: occurrence.startTimezone,
      startsAt: occurrence.startsAt,
    },
    locale
  );
}

function buildWeeklyConversionPreview(
  session: WorkspaceUserGroupSession
): WorkspaceUserGroupSessionReconciliationPreview {
  const timezone =
    session.startTimezone || session.endTimezone || DEFAULT_SCHEDULE_TIMEZONE;
  const date = dayjs(session.startsAt).tz(timezone).format('YYYY-MM-DD');

  return {
    date,
    mode: 'convert_weekly',
    occurrence: {
      date,
      description: session.description,
      descriptionJson: session.descriptionJson,
      endTimezone: session.endTimezone,
      endsAt: session.endsAt,
      groupId: session.groupId,
      groupName: session.groupName,
      seriesId: '',
      startTimezone: session.startTimezone,
      startsAt: session.startsAt,
      title: session.groupName ?? session.title,
    },
    seriesId: '',
    session,
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
  const commonT = useTranslations('common');
  const locale = useLocale();
  const messages = useMessages();
  const queryClient = useQueryClient();
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [groupFilter, setGroupFilter] = useState(groupId ?? 'all');
  const [tagFilter, setTagFilter] = useState('all');
  const [timezone, setTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE);
  const [fullscreen, setFullscreen] = useState(false);
  const [editingSession, setEditingSession] =
    useState<WorkspaceUserGroupSession | null>(null);
  const [draftEvent, setDraftEvent] = useState<CalendarEvent | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(
    null
  );
  const [reconcilePreview, setReconcilePreview] =
    useState<WorkspaceUserGroupSessionReconciliationPreview | null>(null);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);

  const scheduleMessage = useCallback(
    (key: ScheduleMessageKey) => readScheduleMessage(messages, key),
    [messages]
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
        includeMissing: true,
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
      const metadata = [
        session.seriesId ? t('recurring_badge') : null,
        session.files.length
          ? t('files_attached_count', { count: session.files.length })
          : null,
        tags || null,
        session.startTimezone || DEFAULT_SCHEDULE_TIMEZONE,
      ].filter(Boolean);

      return {
        id: session.id,
        title: session.groupName || t('untitled_session'),
        description: [metadata.join(' / '), session.description]
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

  const calendarInitialSettings = useMemo(
    () => ({
      timezone: {
        timezone,
        showSecondaryTimezone: false,
      },
    }),
    [timezone]
  );

  useEffect(() => {
    if (!fullscreen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreen]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateWorkspaceUserGroupSessionPayload) =>
      createWorkspaceUserGroupSession(wsId, payload),
    onError: () => toast.error(t('failed_to_save_session')),
    onSuccess: (response, payload) => {
      if (response.data) {
        queryClient.setQueryData<ListWorkspaceUserGroupSessionsResponse>(
          queryKey,
          (current) => upsertSessions(current, response.data!)
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ['workspace-user-group-sessions', wsId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['group-schedule', payload.groupId],
      });
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

  const previewReconcileMutation = useMutation({
    mutationFn: (session: WorkspaceUserGroupSession) =>
      previewWorkspaceUserGroupSessionReconciliation(wsId, session.id),
    onError: (error, session) => {
      if (error instanceof InternalApiError && error.status === 404) {
        setReconcilePreview(buildWeeklyConversionPreview(session));
        setReconcileDialogOpen(true);
        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : scheduleMessage('no_matching_recurring_schedule')
      );
    },
    onSuccess: (response) => {
      if (!response.data) {
        toast.error(scheduleMessage('no_matching_recurring_schedule'));
        return;
      }

      setReconcilePreview(response.data);
      setReconcileDialogOpen(true);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: ({
      mode,
      sessionId,
    }: {
      mode: WorkspaceUserGroupSessionReconciliationPreview['mode'];
      sessionId: string;
    }) => reconcileWorkspaceUserGroupSession(wsId, sessionId, { mode }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : scheduleMessage('failed_to_fix_recurring_link')
      );
    },
    onSuccess: (response) => {
      if (response.data) {
        queryClient.setQueryData<ListWorkspaceUserGroupSessionsResponse>(
          queryKey,
          (current) => upsertSessions(current, response.data!)
        );
      }
      void queryClient.invalidateQueries({ queryKey });
      setReconcileDialogOpen(false);
      setReconcilePreview(null);
      toast.success(scheduleMessage('recurring_link_fixed'));
    },
  });

  const requestReconcilePreview = useCallback(
    (session: WorkspaceUserGroupSession) => {
      previewReconcileMutation.mutate(session);
    },
    [previewReconcileMutation]
  );

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
      preservePastEventOpacity: true,
      onCreate: (event) => {
        if (!canUpdateSchedule) return undefined;
        setDraftEvent({ id: 'new', ...event });
        return undefined;
      },
      onCreateDraft: (event) => {
        if (!canUpdateSchedule) return;
        setDraftEvent(event);
      },
      renderContextMenu: (event) => {
        const session = sessionsById.get(event._originalId || event.id);
        if (!session) return null;

        return (
          <ContextMenuContent className="w-52">
            <ContextMenuItem
              disabled={!canUpdateSchedule}
              onSelect={() => {
                if (canUpdateSchedule) setEditingSession(session);
              }}
            >
              <Edit className="h-4 w-4" />
              {t('edit_session')}
            </ContextMenuItem>
            {!session.seriesId && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={
                    !canUpdateSchedule ||
                    previewReconcileMutation.isPending ||
                    reconcileMutation.isPending
                  }
                  onSelect={() => {
                    if (!canUpdateSchedule) return;
                    requestReconcilePreview(session);
                  }}
                >
                  <Repeat className="h-4 w-4" />
                  {scheduleMessage('fix_recurring_link')}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        );
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
    [
      canUpdateSchedule,
      sessionsById,
      t,
      requestUpdate,
      previewReconcileMutation.isPending,
      reconcileMutation.isPending,
      requestReconcilePreview,
      scheduleMessage,
    ]
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        fullscreen
          ? 'fixed inset-0 z-50 bg-background p-4'
          : 'h-[calc(100dvh-12rem)] min-h-[720px]'
      )}
    >
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
        onToggleFullscreen={() => setFullscreen((current) => !current)}
        onTimezoneChange={setTimezone}
        onWeekStartChange={setCalendarDate}
        tagFilter={tagFilter}
        tags={tags}
        timezone={timezone}
        fullscreen={fullscreen}
        title={title}
        weekStart={weekStart}
        wsId={wsId}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
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
          initialSettings={calendarInitialSettings}
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
        reconcilePending={
          previewReconcileMutation.isPending || reconcileMutation.isPending
        }
        onOpenChange={(open) => {
          if (!open) setEditingSession(null);
        }}
        onReconcile={(session) => {
          requestReconcilePreview(session);
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

      <Dialog
        open={reconcileDialogOpen}
        onOpenChange={(open) => {
          setReconcileDialogOpen(open);
          if (!open) setReconcilePreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {scheduleMessage('fix_recurring_preview_title')}
            </DialogTitle>
            <DialogDescription>
              {scheduleMessage('fix_recurring_preview_description')}
            </DialogDescription>
          </DialogHeader>

          {reconcilePreview && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {scheduleMessage('detached_session')}
                </div>
                <div className="font-semibold text-sm">
                  {reconcilePreview.session.groupName ||
                    reconcilePreview.session.title ||
                    t('untitled_session')}
                </div>
                <div className="mt-1 flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  {formatSessionPreviewRange(reconcilePreview.session, locale)}
                </div>
              </div>

              <div className="flex justify-center text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
              </div>

              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  {scheduleMessage(
                    reconcilePreview.mode === 'convert_weekly'
                      ? 'new_weekly_recurring_schedule'
                      : 'matching_recurring_occurrence'
                  )}
                </div>
                <div className="font-semibold text-sm">
                  {reconcilePreview.occurrence.groupName ||
                    reconcilePreview.occurrence.title ||
                    t('untitled_session')}
                </div>
                <div className="mt-1 flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  {formatOccurrencePreviewRange(
                    reconcilePreview.occurrence,
                    locale
                  )}
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-3 text-muted-foreground text-sm">
                {scheduleMessage(
                  reconcilePreview.mode === 'snap'
                    ? 'recurring_repair_moves_session'
                    : reconcilePreview.mode === 'convert_weekly'
                      ? 'recurring_repair_creates_weekly_series'
                      : reconcilePreview.mode === 'weekly'
                        ? 'recurring_repair_adds_weekday'
                        : 'recurring_repair_exact_session'
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReconcileDialogOpen(false);
                setReconcilePreview(null);
              }}
            >
              {commonT('cancel')}
            </Button>
            <Button
              disabled={!reconcilePreview || reconcileMutation.isPending}
              type="button"
              onClick={() => {
                if (!reconcilePreview) return;
                reconcileMutation.mutate({
                  mode: reconcilePreview.mode,
                  sessionId: reconcilePreview.session.id,
                });
              }}
            >
              <Repeat className="h-4 w-4" />
              {scheduleMessage(
                reconcilePreview?.mode === 'snap'
                  ? 'confirm_fix_recurring_link_snap'
                  : reconcilePreview?.mode === 'convert_weekly'
                    ? 'confirm_fix_recurring_link_convert_weekly'
                    : reconcilePreview?.mode === 'weekly'
                      ? 'confirm_fix_recurring_link_weekly'
                      : 'confirm_fix_recurring_link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

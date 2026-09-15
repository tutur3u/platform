'use client';
import { useQuery } from '@tanstack/react-query';
import { getMeetFollowupContext } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { FollowupAssignees } from './followup-assignees';
import { FollowupPicker } from './followup-picker';
import type { MeetingFollowup } from './followup-types';

export function FollowupDestination({
  workspaceId,
  sourceWsId,
  meetingId,
  boardId,
  listId,
  onBoard,
  onList,
  task,
  assigneeIds,
  onAssignees,
  calendarId,
  onCalendar,
  suggestion,
  userId,
}: {
  workspaceId: string;
  sourceWsId: string;
  meetingId: string;
  boardId: string;
  listId: string;
  onBoard: (id: string) => void;
  onList: (id: string) => void;
  task: boolean;
  assigneeIds: string[];
  onAssignees: (ids: string[]) => void;
  calendarId: string;
  onCalendar: (id: string) => void;
  suggestion: MeetingFollowup;
  userId: string;
}) {
  const t = useTranslations('meet.ai');
  const context = useQuery({
    queryKey: ['meet-followup-destination', sourceWsId, meetingId, workspaceId],
    queryFn: () => getMeetFollowupContext(sourceWsId, meetingId, workspaceId),
    retry: false,
  });
  const lists = useQuery({
    queryKey: [
      'meet-followup-lists',
      sourceWsId,
      meetingId,
      workspaceId,
      boardId,
    ],
    queryFn: () =>
      getMeetFollowupContext(sourceWsId, meetingId, workspaceId, boardId),
    enabled: task && !!boardId,
    retry: false,
  });
  if (context.isPending)
    return (
      <p role="status" className="text-sm">
        {t('loading')}
      </p>
    );
  if (context.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        {t('followup_destination_failed')}
      </p>
    );
  return (
    <div className="space-y-3">
      {task ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FollowupPicker
              id="followup-board"
              label={t('followup_board')}
              value={boardId}
              options={context.data.boards.map((board) => ({
                id: board.id,
                label: board.name?.trim() || board.id,
              }))}
              onChange={(id) => {
                onBoard(id);
                onList('');
              }}
            />
            <FollowupPicker
              id="followup-list"
              label={t('followup_list')}
              value={listId}
              disabled={!boardId || lists.isPending || lists.isError}
              options={(lists.data?.lists ?? [])
                .filter(
                  (list) => list.status !== 'done' && list.status !== 'closed'
                )
                .map((list) => ({
                  id: list.id,
                  label: list.name?.trim() || list.id,
                }))}
              onChange={onList}
            />
          </div>
          {boardId && lists.isPending && (
            <p role="status" className="text-sm">
              {t('loading')}
            </p>
          )}
          {lists.isError && (
            <p role="alert">{t('followup_destination_failed')}</p>
          )}
          {!context.data.boards.length && (
            <p className="text-muted-foreground text-sm">
              {t('followup_no_boards')}
            </p>
          )}
          {lists.data &&
            !lists.data.lists.some(
              (list) => list.status !== 'done' && list.status !== 'closed'
            ) && (
              <p className="text-muted-foreground text-sm">
                {t('followup_no_lists')}
              </p>
            )}
          <FollowupAssignees
            key={workspaceId}
            members={context.data.members ?? []}
            selected={assigneeIds}
            onChange={onAssignees}
            suggestion={suggestion}
            userId={userId}
          />
        </>
      ) : (
        <FollowupPicker
          id="followup-calendar"
          label={t('followup_calendar')}
          value={calendarId}
          options={(context.data.calendars ?? []).map((calendar) => ({
            id: calendar.id,
            label: calendar.name,
          }))}
          onChange={onCalendar}
        />
      )}
    </div>
  );
}

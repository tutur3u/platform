'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Video } from '@tuturuuu/icons';
import {
  type CalendarEventLinks,
  linkCalendarEventMeeting,
  unlinkCalendarEventMeeting,
} from '@tuturuuu/internal-api/calendar-guests';
import { useTranslations } from 'next-intl';
import { getTasksAppUrl } from '../../../../../lib/tasks-app-url';
import { Button } from '../../../button';
import { Label } from '../../../label';
import { notifySave } from '../../../save-notification';
import { Switch } from '../../../switch';

/** Tuturuuu Meet toggle and join link, plus the linked task, for a saved event. */
export function EventLinks({
  workspaceId,
  eventId,
  links,
  queryKey,
}: {
  workspaceId: string;
  eventId: string;
  links: CalendarEventLinks;
  queryKey: readonly unknown[];
}) {
  const t = useTranslations('calendar.native_guests');
  const queryClient = useQueryClient();
  const meet = useMutation({
    mutationFn: async (enabled: boolean): Promise<void> => {
      if (enabled) await linkCalendarEventMeeting(workspaceId, eventId);
      else await unlinkCalendarEventMeeting(workspaceId, eventId);
    },
    onError: () =>
      notifySave({
        title: t('error_title'),
        description: t('meet_error'),
        variant: 'destructive',
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
  const switchId = `event-meet-${eventId}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          id={switchId}
          checked={Boolean(links.meeting)}
          disabled={meet.isPending}
          onCheckedChange={(checked) => meet.mutate(checked)}
        />
        <Label htmlFor={switchId} className="font-normal text-sm">
          {t('meet_toggle')}
        </Label>
        {links.meeting && (
          <Button asChild size="sm" className="ml-auto">
            <a
              href={links.meeting.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video className="mr-2 size-4" />
              {t('meet_join')}
            </a>
          </Button>
        )}
      </div>
      {links.task && (
        <a
          href={getTasksAppUrl(
            `/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(links.task.id)}`
          )}
          className="flex items-center gap-2 text-sm underline-offset-4 hover:underline"
        >
          <ListTodo className="size-4" aria-hidden />
          <span className="truncate">
            {t('task_link', { name: links.task.name })}
          </span>
        </a>
      )}
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  carryOverMeetingItems,
  getSinceLastTime,
  type SinceLastTimeTask,
} from '@tuturuuu/internal-api/meet-record';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { MAX_CARRY } from './limits';
import type { MeetingRecordLinks } from './meeting-record-panel';
import {
  meetingRecordQueryKey,
  sinceLastTimeQueryKey,
  taskHref,
} from './use-meeting-record';

/** Groups items by owner; unassigned items come last. */
export function groupByOwner(tasks: SinceLastTimeTask[], unassigned: string) {
  const groups = new Map<string, SinceLastTimeTask[]>();
  for (const task of tasks) {
    const owners = task.assignees
      .map((assignee) => assignee.displayName)
      .filter((name): name is string => !!name);
    const key = owners.length ? owners.join(', ') : unassigned;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === unassigned ? 1 : b === unassigned ? -1 : a.localeCompare(b)
  );
}

/**
 * Items from the previous meeting in the same Project, live from Tasks:
 * what was resolved since, and what is still open by owner.
 */
export function SinceLastTime({
  wsId,
  meetingId,
  workspaceSlug,
  tasksUrl,
}: MeetingRecordLinks) {
  const t = useTranslations('meet.record.since');
  const queryClient = useQueryClient();
  const queryKey = sinceLastTimeQueryKey(wsId, meetingId);
  const since = useQuery({
    queryKey,
    queryFn: () => getSinceLastTime(wsId, meetingId),
  });
  const carry = useMutation<{ carried: number }, Error, string[]>({
    mutationFn: (taskIds) => carryOverMeetingItems(wsId, meetingId, taskIds),
    onSuccess: (result: { carried: number }) => {
      toast.success(t('carried', { count: result.carried }));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: meetingRecordQueryKey(wsId, meetingId),
        }),
      ]);
    },
    onError: () => toast.error(t('carry_failed')),
  });

  // The panel appears only once an earlier meeting is known.
  if (!since.data?.previousMeeting) return null;
  const { previousMeeting, open, resolved, canCarry } = since.data;

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{t('title')}</h3>
          <p className="text-muted-foreground text-xs">
            {t('from', { name: previousMeeting.name })}
          </p>
        </div>
        {canCarry && open.length > 0 ? (
          <Button
            disabled={carry.isPending}
            onClick={() =>
              carry.mutate(open.slice(0, MAX_CARRY).map((task) => task.id))
            }
            size="sm"
          >
            {open.length > MAX_CARRY
              ? t('carry_first', { count: MAX_CARRY })
              : t('carry_all', { count: open.length })}
          </Button>
        ) : null}
      </div>
      {open.length === 0 && resolved.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : null}
      {groupByOwner(open, t('unassigned')).map(([owner, tasks]) => (
        <div key={owner} className="space-y-1">
          <p className="font-medium text-xs">{owner}</p>
          <ul className="space-y-1">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{t('open')}</Badge>
                <a
                  className="min-w-0 flex-1 truncate hover:underline"
                  href={taskHref(tasksUrl, workspaceSlug, task.id)}
                >
                  {task.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {resolved.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-xs">
            {t('resolved', { count: resolved.length })}
          </p>
          <ul className="space-y-1">
            {resolved.map((task) => (
              <li key={task.id} className="flex items-center gap-2 text-sm">
                <Badge variant="success">{t('done')}</Badge>
                <a
                  className="min-w-0 flex-1 truncate text-muted-foreground hover:underline"
                  href={taskHref(tasksUrl, workspaceSlug, task.id)}
                >
                  {task.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

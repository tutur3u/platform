'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, VolumeX } from '@tuturuuu/icons';
import { bulkUpdateMailThreads } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MailIconButton } from './mail-icon-button';

type Preference = 'snooze' | 'unsnooze' | 'mute' | 'unmute';
export function MailThreadPreferenceMenu({
  mailboxId,
  workspaceId,
  threadIds,
  onChanged,
}: {
  mailboxId: string;
  workspaceId: string;
  threadIds: string[];
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations('mail');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const mutation = useMutation({
    mutationFn: ({
      action,
      snoozedUntil,
      target,
    }: {
      target: { workspaceId: string; mailboxId: string; threadIds: string[] };
      action: Preference;
      snoozedUntil?: string;
    }) =>
      bulkUpdateMailThreads(target.workspaceId, target.mailboxId, {
        threadIds: target.threadIds,
        action,
        snoozedUntil,
      }),
    onSuccess: async (_data, { action, target }) => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ['mail', target.workspaceId, target.mailboxId],
      });
      await onChanged();
      toast.success(
        t(action),
        action === 'snooze' || action === 'mute'
          ? {
              action: {
                label: t('undo'),
                onClick: () => {
                  void bulkUpdateMailThreads(
                    target.workspaceId,
                    target.mailboxId,
                    {
                      threadIds: target.threadIds,
                      action: action === 'snooze' ? 'unsnooze' : 'unmute',
                    }
                  )
                    .then(() =>
                      queryClient.invalidateQueries({
                        queryKey: [
                          'mail',
                          target.workspaceId,
                          target.mailboxId,
                        ],
                      })
                    )
                    .catch(() => toast.error(t('update_failed')));
                },
              },
            }
          : undefined
      );
    },
    onError: () => toast.error(t('update_failed')),
  });
  const mutate = (value: { action: Preference; snoozedUntil?: string }) =>
    mutation.mutate({
      ...value,
      target: { workspaceId, mailboxId, threadIds: [...threadIds] },
    });
  const snooze = (hours: number) =>
    mutate({
      action: 'snooze',
      snoozedUntil: new Date(Date.now() + hours * 3600000).toISOString(),
    });
  const parsedTime = new Date(customTime).getTime();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <MailIconButton
          aria-label={t('thread_preferences')}
          disabled={mutation.isPending}
        >
          <Clock className="size-4" />
        </MailIconButton>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="end">
        <p className="font-medium text-sm">{t('snooze')}</p>
        <p className="text-muted-foreground text-xs">
          {t('thread_preferences_hint')}
        </p>
        {([1, 24, 168] as const).map((hours) => (
          <Button
            key={hours}
            className="w-full justify-start"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => snooze(hours)}
          >
            {t(
              hours === 1
                ? 'snooze_hour'
                : hours === 24
                  ? 'snooze_day'
                  : 'snooze_week'
            )}
          </Button>
        ))}
        <label className="grid gap-1 text-xs">
          {t('snooze_custom')}
          <input
            className="rounded-md border bg-background p-2 text-sm"
            type="datetime-local"
            value={customTime}
            onChange={(event) => setCustomTime(event.target.value)}
          />
        </label>
        <Button
          className="w-full"
          disabled={
            mutation.isPending ||
            !Number.isFinite(parsedTime) ||
            parsedTime <= Date.now()
          }
          onClick={() =>
            mutate({
              action: 'snooze',
              snoozedUntil: new Date(parsedTime).toISOString(),
            })
          }
        >
          {t('snooze')}
        </Button>
        <Button
          className="w-full justify-start"
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => mutate({ action: 'unsnooze' })}
        >
          {t('unsnooze')}
        </Button>
        <Button
          className="w-full justify-start"
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => mutate({ action: 'mute' })}
        >
          <VolumeX className="size-4" />
          {t('mute')}
        </Button>
        <Button
          className="w-full justify-start"
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => mutate({ action: 'unmute' })}
        >
          {t('unmute')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

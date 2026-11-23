'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from '@tuturuuu/icons';
import {
  addMeetingRecordItem,
  deleteMeetingRecordItem,
  type MeetingRecordItem,
  updateMeetingRecordItem,
} from '@tuturuuu/internal-api/meet-record';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { meetingRecordQueryKey } from './use-meeting-record';

type Change =
  | { type: 'add'; content: string }
  | { type: 'toggle'; id: string; completed: boolean }
  | { type: 'remove'; id: string };

/** Agenda items or decisions on the meeting record. */
export function RecordItemList({
  wsId,
  meetingId,
  kind,
  items,
  canEdit,
}: {
  wsId: string;
  meetingId: string;
  kind: MeetingRecordItem['kind'];
  items: MeetingRecordItem[];
  canEdit: boolean;
}) {
  const t = useTranslations('meet.record');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const change = useMutation<{ id: string }, Error, Change>({
    mutationFn: (input) =>
      input.type === 'add'
        ? addMeetingRecordItem(wsId, meetingId, {
            kind,
            content: input.content,
          })
        : input.type === 'toggle'
          ? updateMeetingRecordItem(wsId, meetingId, {
              id: input.id,
              completed: input.completed,
            })
          : deleteMeetingRecordItem(wsId, meetingId, input.id),
    onSuccess: (_result: { id: string }, input: Change) => {
      if (input.type === 'add') setDraft('');
      return queryClient.invalidateQueries({
        queryKey: meetingRecordQueryKey(wsId, meetingId),
      });
    },
    onError: () => toast.error(t('change_failed')),
  });
  const agenda = kind === 'agenda';

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t(agenda ? 'empty_agenda' : 'empty_decisions')}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              {agenda ? (
                <Checkbox
                  aria-label={t('mark_done', { item: item.content })}
                  checked={item.completedAt !== null}
                  className="mt-0.5"
                  disabled={!canEdit || change.isPending}
                  onCheckedChange={(checked) =>
                    change.mutate({
                      type: 'toggle',
                      id: item.id,
                      completed: checked === true,
                    })
                  }
                />
              ) : null}
              <span
                className={cn(
                  'min-w-0 flex-1 break-words text-sm',
                  item.completedAt && 'text-muted-foreground line-through'
                )}
              >
                {item.content}
              </span>
              {canEdit ? (
                <Button
                  aria-label={t('remove', { item: item.content })}
                  className="size-7"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ type: 'remove', id: item.id })}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const content = draft.trim();
            if (content) change.mutate({ type: 'add', content });
          }}
        >
          <Input
            aria-label={t(agenda ? 'add_agenda' : 'add_decision')}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t(agenda ? 'add_agenda' : 'add_decision')}
            value={draft}
          />
          <Button
            disabled={!draft.trim() || change.isPending}
            type="submit"
            variant="secondary"
          >
            {t('add')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

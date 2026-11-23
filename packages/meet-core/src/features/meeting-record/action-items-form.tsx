'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMeetFollowupContext,
  type MeetFollowupContext,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SheetFooter } from '@tuturuuu/ui/sheet';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ActionItemRow } from './action-item-row';
import {
  type ActionDraft,
  type ActionSuggestion,
  draftFromSuggestion,
  manualDraft,
  parsePastedActions,
  readReceipt,
  savable,
} from './action-items';
import type { MeetingRecordLinks } from './meeting-record-panel';
import { saveActionItem } from './save-action-item';
import { meetingRecordQueryKey } from './use-meeting-record';

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Reviews every action item at once and saves the chosen ones as tasks. */
export function ActionItemsForm({
  wsId,
  meetingId,
  sourceUrl,
  context,
  defaultBoardId,
  suggestions,
  onClose,
}: MeetingRecordLinks & {
  context: MeetFollowupContext;
  defaultBoardId: string | null;
  suggestions: ActionSuggestion[];
  onClose: () => void;
}) {
  const t = useTranslations('meet.record.sheet');
  const queryClient = useQueryClient();
  const members = (context.members ?? []).map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.email,
  }));
  const boardId =
    context.boards.find((board) => board.id === defaultBoardId)?.id ??
    context.boards[0]?.id ??
    '';
  const userId = context.user.id;
  const [drafts, setDrafts] = useState<ActionDraft[]>(() => {
    const storage = browserStorage();
    return suggestions.map((suggestion): ActionDraft => {
      const draft = draftFromSuggestion(suggestion, members, boardId);
      const receipt = readReceipt(storage, userId, suggestion.key);
      return receipt.status === 'saved'
        ? { ...draft, include: false, status: 'saved', url: receipt.url }
        : receipt.status === 'uncertain'
          ? { ...draft, include: false, status: 'uncertain' }
          : draft;
    });
  });
  const [pasted, setPasted] = useState('');
  const update = (key: string, patch: Partial<ActionDraft>) =>
    setDrafts((all) =>
      all.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    );
  const pending = drafts.filter(savable);
  const timezone =
    context.timezone && context.timezone !== 'auto'
      ? context.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone;

  const save = useMutation({
    mutationFn: async (queue: ActionDraft[]) => {
      const target = {
        wsId,
        meetingId,
        userId,
        timezone,
        sourceUrl,
        storage: browserStorage(),
        readLists: async (board: string) =>
          (
            await queryClient.fetchQuery({
              queryKey: ['meeting-record-board-lists', wsId, meetingId, board],
              queryFn: () =>
                getMeetFollowupContext(wsId, meetingId, wsId, board),
              staleTime: 60_000,
            })
          ).lists,
      };
      // One at a time keeps each save's receipt and outcome independent.
      for (const draft of queue) {
        update(draft.key, { status: 'saving' });
        update(draft.key, await saveActionItem(draft, target));
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: meetingRecordQueryKey(wsId, meetingId),
      }),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {drafts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <ul className="divide-y">
            {drafts.map((draft) => (
              <ActionItemRow
                key={draft.key}
                boards={context.boards}
                disabled={save.isPending}
                draft={draft}
                members={members}
                onChange={(patch) => update(draft.key, patch)}
              />
            ))}
          </ul>
        )}
        <form
          className="space-y-2 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const titles = parsePastedActions(pasted);
            if (!titles.length) return;
            setDrafts((all) => [
              ...all,
              ...titles.map((title) => manualDraft(meetingId, title, boardId)),
            ]);
            setPasted('');
          }}
        >
          <Textarea
            aria-label={t('paste_label')}
            disabled={save.isPending}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={t('paste_label')}
            rows={3}
            value={pasted}
          />
          <Button
            disabled={!pasted.trim() || save.isPending}
            type="submit"
            variant="secondary"
          >
            {t('paste_add')}
          </Button>
        </form>
        {context.boards.length === 0 ? (
          <p className="pt-2 text-destructive text-sm">{t('no_boards')}</p>
        ) : null}
      </div>
      <SheetFooter className="flex-row justify-end gap-2">
        <Button disabled={save.isPending} onClick={onClose} variant="outline">
          {t('close')}
        </Button>
        <Button
          disabled={!pending.length || save.isPending}
          onClick={() => save.mutate(pending)}
        >
          {t(save.isPending ? 'saving' : 'save', { count: pending.length })}
        </Button>
      </SheetFooter>
    </div>
  );
}

'use client';

import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type { ActionDraft, ActionMember } from './action-items';

const UNASSIGNED = 'unassigned';

/** One action item under review: title, assignee, due date and board. */
export function ActionItemRow({
  draft,
  members,
  boards,
  disabled,
  onChange,
}: {
  draft: ActionDraft;
  members: ActionMember[];
  boards: Array<{ id: string; name: string | null }>;
  disabled: boolean;
  onChange: (patch: Partial<ActionDraft>) => void;
}) {
  const t = useTranslations('meet.record.sheet');
  const locked =
    disabled ||
    draft.status === 'saving' ||
    draft.status === 'saved' ||
    draft.status === 'uncertain';
  const id = `action-${draft.key}`;

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label={t('include', { title: draft.title })}
          checked={draft.include}
          disabled={locked}
          onCheckedChange={(checked) => onChange({ include: checked === true })}
        />
        <Input
          aria-label={t('title_label')}
          disabled={locked}
          maxLength={255}
          onChange={(event) => onChange({ title: event.target.value })}
          value={draft.title}
        />
      </div>
      <div className="grid gap-2 pl-6 sm:grid-cols-3">
        <Select
          disabled={locked}
          onValueChange={(value) =>
            onChange({ assigneeId: value === UNASSIGNED ? null : value })
          }
          value={draft.assigneeId ?? UNASSIGNED}
        >
          <SelectTrigger aria-label={t('assignee')} id={`${id}-assignee`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>{t('unassigned')}</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.displayName ?? member.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label={t('due')}
          disabled={locked}
          onChange={(event) => onChange({ dueDate: event.target.value })}
          type="date"
          value={draft.dueDate}
        />
        <Select
          disabled={locked || boards.length === 0}
          onValueChange={(boardId) => onChange({ boardId })}
          value={draft.boardId || undefined}
        >
          <SelectTrigger aria-label={t('board')} id={`${id}-board`}>
            <SelectValue placeholder={t('board')} />
          </SelectTrigger>
          <SelectContent>
            {boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.name ?? board.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DraftStatus draft={draft} />
    </li>
  );
}

function DraftStatus({ draft }: { draft: ActionDraft }) {
  const t = useTranslations('meet.record.sheet');
  switch (draft.status) {
    case 'idle':
    case 'saving':
      return null;
    case 'saved':
      return draft.url ? (
        <a className="pl-6 text-sm underline" href={draft.url}>
          {t('saved')}
        </a>
      ) : (
        <p className="pl-6 text-sm">{t('saved')}</p>
      );
    case 'rejected':
      return <p className="pl-6 text-destructive text-sm">{t('rejected')}</p>;
    case 'no_list':
      return <p className="pl-6 text-destructive text-sm">{t('no_list')}</p>;
    case 'uncertain':
      return (
        <p className="pl-6 text-muted-foreground text-sm">{t('uncertain')}</p>
      );
  }
}

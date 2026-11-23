'use client';

import { Link2, Plus } from '@tuturuuu/icons';
import type { MeetWhiteboardGuestAccess } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { GuestAccessSelect } from './board-picker';

/** Link an existing workspace whiteboard or create one; hosts and admins only. */
export function BoardManage({
  available,
  pending,
  onLink,
  onCreate,
}: {
  available: readonly { id: string; title: string }[];
  pending: boolean;
  onLink: (boardId: string, access: MeetWhiteboardGuestAccess) => void;
  onCreate: (title: string, access: MeetWhiteboardGuestAccess) => void;
}) {
  const t = useTranslations('meet.collaboration');
  const [access, setAccess] = useState<MeetWhiteboardGuestAccess>('view');
  const [boardId, setBoardId] = useState('');
  const [title, setTitle] = useState('');
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim(), access);
    setTitle('');
  };
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={boardId} onValueChange={setBoardId}>
          <SelectTrigger
            aria-label={t('board_pick')}
            className="h-9 min-w-48 flex-1"
          >
            <SelectValue placeholder={t('board_pick_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {available.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!boardId || pending}
          onClick={() => {
            onLink(boardId, access);
            setBoardId('');
          }}
        >
          <Link2 className="mr-1 h-4 w-4" />
          {t('board_link')}
        </Button>
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={create}>
        <Input
          value={title}
          maxLength={120}
          aria-label={t('board_new_title')}
          placeholder={t('board_new_title')}
          className="h-9 min-w-48 flex-1"
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button size="sm" type="submit" disabled={!title.trim() || pending}>
          <Plus className="mr-1 h-4 w-4" />
          {t('board_create')}
        </Button>
      </form>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span>{t('board_guests')}</span>
        <GuestAccessSelect
          value={access}
          label={t('board_guests')}
          onChange={setAccess}
        />
      </div>
    </div>
  );
}

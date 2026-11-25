'use client';

import { PenTool, Unlink } from '@tuturuuu/icons';
import type {
  MeetWhiteboardGuestAccess,
  MeetWhiteboardLink,
} from '@tuturuuu/internal-api/meet-whiteboard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { ActivitySelect } from '../stage-layout/activity-select';

const ACCESS = ['none', 'view', 'draw'] as const;

/**
 * A board's guest access. While guest drawing is held (`drawHeld`), `draw`
 * says guests view for now: the server mints them view tickets regardless.
 */
export function GuestAccessSelect({
  value,
  label,
  onChange,
  disabled,
  drawHeld = false,
}: {
  value: MeetWhiteboardGuestAccess;
  label: string;
  onChange: (value: MeetWhiteboardGuestAccess) => void;
  disabled?: boolean;
  drawHeld?: boolean;
}) {
  const t = useTranslations('meet.collaboration');
  return (
    <ActivitySelect
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as MeetWhiteboardGuestAccess)}
    >
      <SelectTrigger aria-label={label} className="h-8 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ACCESS.map((level) => (
          <SelectItem key={level} value={level}>
            {t(
              level === 'draw' && drawHeld
                ? 'board_access_draw_held'
                : `board_access_${level}`
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </ActivitySelect>
  );
}

/** The boards linked to this meeting, with link settings for managers. */
export function BoardPicker({
  links,
  canManage,
  pending,
  drawHeld = false,
  onOpen,
  onGuestAccess,
  onUnlink,
}: {
  links: readonly MeetWhiteboardLink[];
  canManage: boolean;
  pending: boolean;
  /** Guest drawing is held, so `draw` boards are view-only for guests. */
  drawHeld?: boolean;
  onOpen: (boardId: string) => void;
  onGuestAccess: (boardId: string, value: MeetWhiteboardGuestAccess) => void;
  onUnlink: (boardId: string) => void;
}) {
  const t = useTranslations('meet.collaboration');
  if (links.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        {t(canManage ? 'board_empty_manage' : 'board_empty_member')}
      </p>
    );
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {links.map((link) => (
        <li
          key={link.boardId}
          className="flex flex-wrap items-center gap-2 px-3 py-2"
        >
          <PenTool className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {link.title}
          </span>
          {link.role === 'view' && (
            <Badge variant="secondary">{t('board_view_only')}</Badge>
          )}
          {canManage && link.guestAccess && (
            <GuestAccessSelect
              value={link.guestAccess}
              label={t('board_guests')}
              disabled={pending}
              drawHeld={drawHeld}
              onChange={(value) => onGuestAccess(link.boardId, value)}
            />
          )}
          <Button size="sm" onClick={() => onOpen(link.boardId)}>
            {t('board_open')}
          </Button>
          {canManage && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              aria-label={t('board_unlink')}
              title={t('board_unlink')}
              onClick={() => onUnlink(link.boardId)}
            >
              <Unlink className="h-4 w-4" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

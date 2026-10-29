'use client';

import { Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MeetingActionHint } from './meeting-action-hint';

/** Host banner while people wait in the lobby. */
export function WaitingRoomNotice({
  waiting,
  participants,
  onOpen,
}: {
  waiting: number;
  participants: number;
  onOpen: () => void;
}) {
  const t = useTranslations('meet.call');
  if (!waiting) return null;
  return (
    <output className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
      <span className="text-sm">{t('waiting_room', { count: waiting })}</span>
      <MeetingActionHint label={t('participants', { count: participants })}>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-full"
          onClick={onOpen}
        >
          <Users className="size-3.5" />
          {t('participants', { count: participants })}
        </Button>
      </MeetingActionHint>
    </output>
  );
}

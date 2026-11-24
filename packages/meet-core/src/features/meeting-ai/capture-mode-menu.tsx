'use client';

import { Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { CaptureModePicker } from './capture-mode-picker';
import type { SelfRoomView } from './self-room';

/**
 * Header entry to the capture mode for every host and co-host while no
 * transcript is running; during a session the transcript notice shows it.
 */
export function CaptureModeMenu({
  wsId,
  meetingId,
  room,
}: {
  wsId: string;
  meetingId: string;
  room: SelfRoomView;
}) {
  const t = useTranslations('meet.ai');
  if (!room.available || !room.canManageMode) return null;
  const label = t(room.mode === 'self' ? 'self_mode_self' : 'self_mode_room');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={t('self_mode_title')}
        >
          <Settings2 aria-hidden className="size-4" />
          <span className="max-sm:sr-only">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(18rem,calc(100vw-2rem))] text-sm"
      >
        <CaptureModePicker wsId={wsId} meetingId={meetingId} room={room} />
      </PopoverContent>
    </Popover>
  );
}

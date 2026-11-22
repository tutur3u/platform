'use client';
import { ScrollText } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';
import { MeetSettingsCard, MeetSettingsToggle } from './meet-settings-card';

/** Host-only: whether admitted participants can read the transcript and notes. */
export function NotesAccessSettings({
  room,
}: {
  room: Pick<MeetRoomController, 'state' | 'shareNotes'>;
}) {
  const t = useTranslations('meet.call');
  return (
    <MeetSettingsCard>
      <MeetSettingsToggle
        id="meet-share-notes"
        icon={<ScrollText className="size-4" />}
        label={t('share_notes')}
        hint={t('share_notes_hint')}
        checked={room.state.settings.shareNotes === true}
        onCheckedChange={room.shareNotes}
      />
    </MeetSettingsCard>
  );
}

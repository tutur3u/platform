'use client';
import { ScrollText } from '@tuturuuu/icons';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { SettingsField } from '../../../../../ui/src/components/ui/custom/settings-field';
import type { MeetRoomController } from '../lib/room-controller';

/** Host-only: whether admitted participants can read the transcript and notes. */
export function NotesAccessSettings({
  room,
}: {
  room: Pick<MeetRoomController, 'state' | 'shareNotes'>;
}) {
  const t = useTranslations('meet.call');
  return (
    <SettingsSection>
      <SettingsField
        id="meet-share-notes"
        icon={<ScrollText className="size-4" />}
        label={t('share_notes')}
        description={t('share_notes_hint')}
        layout="compact"
      >
        {(field) => (
          <Switch
            {...field}
            checked={room.state.settings.shareNotes === true}
            onCheckedChange={room.shareNotes}
          />
        )}
      </SettingsField>
    </SettingsSection>
  );
}

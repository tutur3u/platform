'use client';
import { MessageSquareText } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';
import { MeetSettingsCard, MeetSettingsToggle } from './meet-settings-card';

export function ChatSettings({
  room,
  canManage,
}: {
  room: MeetRoomController;
  canManage: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <MeetSettingsCard>
      <MeetSettingsToggle
        id="meet-save-chat"
        icon={<MessageSquareText className="size-4" />}
        label={t('save_chat')}
        hint={t('save_chat_hint')}
        checked={room.state.settings.saveChat !== false}
        disabled={!canManage}
        onCheckedChange={(saveChat) => room.updateSettings({ saveChat })}
      />
    </MeetSettingsCard>
  );
}

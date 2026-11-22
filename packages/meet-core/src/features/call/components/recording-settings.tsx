'use client';
import { CircleDot, Lock, Users } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';
import {
  MeetSettingsCard,
  MeetSettingsHeading,
  MeetSettingsToggle,
} from './meet-settings-card';
import { RecordingHistory } from './recording-history';

export function RecordingSettings({
  room,
  meetingId,
  canManage,
}: {
  room: MeetRoomController;
  meetingId: string;
  canManage: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <MeetSettingsCard>
      <MeetSettingsHeading
        icon={<CircleDot className="size-4" />}
        title={t('recordings')}
        description={t('recording_hint')}
      />
      {canManage && (
        <div className="grid gap-4 border-t pt-4">
          {(
            [
              {
                key: 'shareRecordings',
                label: t('recording_access'),
                hint: t('recording_access_hint'),
                Icon: Lock,
              },
              {
                key: 'allowParticipantRecording',
                label: t('recording_control'),
                hint: t('recording_control_hint'),
                Icon: Users,
              },
            ] as const
          ).map(({ key, label, hint, Icon }) => (
            <MeetSettingsToggle
              key={key}
              id={`meet-${key}`}
              icon={<Icon className="size-4" />}
              label={label}
              hint={hint}
              checked={!!room.state.settings[key]}
              onCheckedChange={(enabled) =>
                room.updateSettings({ [key]: enabled })
              }
            />
          ))}
        </div>
      )}
      {(canManage || room.state.settings.shareRecordings) && (
        <div className="grid gap-3 border-t pt-4">
          <RecordingHistory meetingId={meetingId} />
        </div>
      )}
    </MeetSettingsCard>
  );
}

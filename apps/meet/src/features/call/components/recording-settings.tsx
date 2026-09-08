'use client';
import { CircleDot, Lock, Users } from '@tuturuuu/icons';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';
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
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <CircleDot className="size-4" />
        {t('recordings')}
      </h3>
      <p className="text-muted-foreground text-xs">{t('recording_hint')}</p>
      {canManage &&
        (
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
          <div key={key} className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label
                htmlFor={`meet-${key}`}
                className="flex items-center gap-2"
              >
                <Icon className="size-3.5" />
                {label}
              </Label>
              <p className="text-muted-foreground text-xs">{hint}</p>
            </div>
            <Switch
              id={`meet-${key}`}
              checked={!!room.state.settings[key]}
              onCheckedChange={(enabled) =>
                room.updateSettings({
                  [key]: enabled,
                })
              }
            />
          </div>
        ))}
      {(canManage || room.state.settings.shareRecordings) && (
        <RecordingHistory meetingId={meetingId} />
      )}
    </section>
  );
}

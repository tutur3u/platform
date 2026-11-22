'use client';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';
import { MeetSettingsCard, MeetSettingsToggle } from './meet-settings-card';

export function ClassroomSettings({
  room,
}: {
  room: Pick<MeetRoomController, 'state' | 'updateSettings'>;
}) {
  const t = useTranslations('meet.call');
  const maximum = room.state.maxParticipants;
  if (
    room.state.role !== 'host' ||
    (maximum === undefined && !room.state.classViewersAvailable)
  )
    return null;
  return (
    <MeetSettingsCard>
      {room.state.classViewersAvailable && (
        <MeetSettingsToggle
          id="meet-class-viewers"
          label={t('class_viewers')}
          hint={t('class_viewers_hint')}
          checked={room.state.settings.viewersByDefault === true}
          onCheckedChange={(viewersByDefault) =>
            room.updateSettings({ viewersByDefault })
          }
        />
      )}
      {maximum !== undefined && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="meet-room-maximum">{t('room_maximum')}</Label>
            <Input
              id="meet-room-maximum"
              type="number"
              min={1}
              max={maximum}
              aria-describedby="meet-room-maximum-hint"
              key={room.state.settings.maxParticipants ?? maximum}
              defaultValue={room.state.settings.maxParticipants ?? maximum}
              onBlur={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isInteger(value) && value >= 1 && value <= maximum)
                  room.updateSettings({ maxParticipants: value });
                else
                  event.currentTarget.value = String(
                    room.state.settings.maxParticipants ?? maximum
                  );
              }}
            />
            <p
              id="meet-room-maximum-hint"
              className="text-muted-foreground text-sm"
            >
              {t('room_maximum_hint', { maximum })}
            </p>
          </div>
          <MeetSettingsToggle
            id="meet-stop-admission"
            label={t('stop_admission')}
            hint={t('stop_admission_hint')}
            checked={room.state.settings.admissionClosed === true}
            onCheckedChange={(admissionClosed) =>
              room.updateSettings({ admissionClosed })
            }
          />
        </>
      )}
    </MeetSettingsCard>
  );
}

'use client';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';

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
    <section className="space-y-4 rounded-xl border p-4">
      {room.state.classViewersAvailable && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="meet-class-viewers">{t('class_viewers')}</Label>
            <Switch
              id="meet-class-viewers"
              aria-describedby="meet-class-viewers-hint"
              checked={room.state.settings.viewersByDefault === true}
              onCheckedChange={(viewersByDefault) =>
                room.updateSettings({ viewersByDefault })
              }
            />
          </div>
          <p
            id="meet-class-viewers-hint"
            className="text-muted-foreground text-xs"
          >
            {t('class_viewers_hint')}
          </p>
        </div>
      )}
      {maximum !== undefined && (
        <>
          <div className="space-y-2">
            <Label htmlFor="meet-room-maximum">{t('room_maximum')}</Label>
            <Input
              id="meet-room-maximum"
              type="number"
              min={1}
              max={maximum}
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
            <p className="text-muted-foreground text-xs">
              {t('room_maximum_hint', { maximum })}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="meet-stop-admission">{t('stop_admission')}</Label>
            <Switch
              id="meet-stop-admission"
              checked={room.state.settings.admissionClosed === true}
              onCheckedChange={(admissionClosed) =>
                room.updateSettings({ admissionClosed })
              }
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {t('stop_admission_hint')}
          </p>
        </>
      )}
    </section>
  );
}

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
  if (room.state.role !== 'host' || maximum === undefined) return null;
  return (
    <section className="space-y-4 rounded-xl border p-4">
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
    </section>
  );
}

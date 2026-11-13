'use client';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../call/lib/room-controller';

export function deliverRoomAssistantAudio(
  _meetingId: string,
  _message: MeetRealtimeServerMessage
) {
  return false;
}

export function RoomAssistantAudio({
  room,
}: {
  meetingId: string;
  outputDeviceId: string;
  canManage?: boolean;
  room: MeetRoomController;
  audioSuppressed?: boolean;
}) {
  const t = useTranslations('meet.live');
  const people = Object.values(room.state.participants).filter(
    (person) => person.miraPrivate
  );
  if (!people.length) return null;
  return (
    <div className="flex flex-wrap gap-2" role="status">
      {people.map((person) => (
        <span key={person.userId} className="text-muted-foreground text-xs">
          {t('phase_private_indicator', { name: person.displayName })}
        </span>
      ))}
    </div>
  );
}

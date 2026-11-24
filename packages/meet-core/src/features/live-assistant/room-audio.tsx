import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import type { MeetRoomController } from '../call/lib/room-controller';

export function deliverRoomAssistantAudio(
  _meetingId: string,
  _message: MeetRealtimeServerMessage
) {
  return false;
}

/** The people using Mira privately; the Mira control lists them for the room. */
export function privateMiraUsers(
  participants: MeetRoomController['state']['participants']
) {
  return Object.values(participants)
    .filter((person) => person.miraPrivate)
    .map((person) => ({
      userId: person.userId,
      displayName: person.displayName,
    }));
}

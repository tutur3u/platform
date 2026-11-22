import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import {
  closeLiveActivitiesRoom,
  liveActivitiesRoom,
} from './activities-store';

export function handleLiveActivitiesMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage,
  send: (message: MeetRealtimeClientMessage) => boolean
) {
  switch (message.type) {
    case 'ready': {
      const room = liveActivitiesRoom(meetingId);
      room.close();
      room.setManager(message.canManageParticipants ?? message.role === 'host');
      if (message.admission === 'admitted') room.open(send);
      break;
    }
    case 'admission.result':
      if (message.admitted) liveActivitiesRoom(meetingId).open(send);
      else closeLiveActivitiesRoom(meetingId);
      break;
    case 'activity.snapshot':
    case 'activity.mine':
    case 'activity.host':
    // The store keeps only a refusal of this person's own last command.
    case 'error':
      liveActivitiesRoom(meetingId).receive(message);
      break;
    case 'room.ended':
      closeLiveActivitiesRoom(meetingId);
      break;
  }
}

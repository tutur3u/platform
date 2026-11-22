import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import type { MeetSignalingStatus } from '../../lib/signaling';
import {
  closeLiveActivitiesRoom,
  liveActivitiesRoom,
  suspendLiveActivitiesRoom,
} from './activities-store';
import { runsRoomActivities } from './activity-manager';

/**
 * What the room socket's state means for the activities on screen. A socket
 * that is still recovering keeps the last state, so a brief reconnect does not
 * blank the panels; one that has given up clears it.
 */
export function handleLiveActivitiesTransport(
  meetingId: string,
  status: MeetSignalingStatus
) {
  if (status === 'open') return;
  if (status === 'closed' || status === 'error')
    closeLiveActivitiesRoom(meetingId);
  else suspendLiveActivitiesRoom(meetingId);
}

export function handleLiveActivitiesMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage,
  send: (message: MeetRealtimeClientMessage) => boolean
) {
  switch (message.type) {
    case 'ready': {
      const room = liveActivitiesRoom(meetingId);
      // After a reconnect the last state stays until the fresh read replaces
      // it; only someone sent back to the waiting room starts from nothing.
      if (message.admission !== 'admitted') room.close();
      room.setManager(runsRoomActivities(message));
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

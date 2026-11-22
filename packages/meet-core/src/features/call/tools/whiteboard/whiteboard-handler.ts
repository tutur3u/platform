import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import { runsRoomActivities } from '../live-activities/activity-manager';
import { closeWhiteboardRoom, whiteboardRoom } from './whiteboard-store';

export function handlePenboardMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage,
  send: (message: MeetRealtimeClientMessage) => boolean
) {
  switch (message.type) {
    case 'ready': {
      const room = whiteboardRoom(meetingId);
      room.close();
      room.identify(message.userId, runsRoomActivities(message));
      if (message.admission === 'admitted') room.open(send);
      break;
    }
    case 'admission.result':
      if (message.admitted) whiteboardRoom(meetingId).open(send);
      else closeWhiteboardRoom(meetingId);
      break;
    case 'room.ended':
      closeWhiteboardRoom(meetingId);
      break;
    case 'penboard.snapshot':
    case 'penboard.stroke':
      whiteboardRoom(meetingId).receive(message);
      break;
    case 'error':
      if (message.requestId) whiteboardRoom(meetingId).receive(message);
      break;
  }
}

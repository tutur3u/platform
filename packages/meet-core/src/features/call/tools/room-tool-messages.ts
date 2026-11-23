import { deliverRoomAssistantAudio } from '@tuturuuu/meet-core/features/live-assistant/room-audio';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import type { createRoomActions } from '../lib/room-actions';
import type { MeetSignaling, MeetSignalingStatus } from '../lib/signaling';
import {
  handleLiveActivitiesMessage,
  handleLiveActivitiesTransport,
} from './live-activities/activities-handler';
import { closeLiveActivitiesRoom } from './live-activities/activities-store';
import { handleLiveQaMessage } from './live-activities/qa/qa-handler';
import { closeUpskiiRoom, handleUpskiiMessage } from './upskii/upskii-store';
import { handlePenboardMessage } from './whiteboard/whiteboard-handler';
import { closeWhiteboardRoom } from './whiteboard/whiteboard-store';

function handleMeetToolMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage,
  actions: Pick<
    ReturnType<typeof createRoomActions>,
    'sendLiveQa' | 'sendSharedTool'
  >
) {
  deliverRoomAssistantAudio(meetingId, message);
  handleLiveQaMessage(meetingId, message, actions.sendLiveQa);
  handleLiveActivitiesMessage(meetingId, message, actions.sendSharedTool);
  handlePenboardMessage(meetingId, message, actions.sendSharedTool);
  handleUpskiiMessage(meetingId, message, actions.sendSharedTool);
}

function clearRoomTools(meetingId: string) {
  closeLiveActivitiesRoom(meetingId);
  closeWhiteboardRoom(meetingId);
  closeUpskiiRoom(meetingId);
}

function roomToolTransportStatus(
  meetingId: string,
  onStatus: (status: MeetSignalingStatus) => void
) {
  return (status: MeetSignalingStatus) => {
    if (status !== 'open') {
      // Activities keep their last state while the socket recovers; the board
      // has no drafts and is read again from the room.
      handleLiveActivitiesTransport(meetingId, status);
      closeWhiteboardRoom(meetingId);
    }
    onStatus(status);
  };
}

function closeRoomToolTransport(
  meetingId: string,
  signaling: MeetSignaling | null
) {
  signaling?.close();
  clearRoomTools(meetingId);
}

export const meetRoomTools = {
  handleMessage: handleMeetToolMessage,
  onStatus: roomToolTransportStatus,
  close: closeRoomToolTransport,
};

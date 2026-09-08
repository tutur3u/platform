import type {
  MeetReaction,
  MeetRealtimeTrackKind,
  MeetRoomSettings,
} from '@tuturuuu/realtime/meet';
import type { MeetSignaling } from './signaling';

export function createRoomActions(signaling: {
  current: MeetSignaling | null;
}) {
  return {
    reportUsage: (reportId: string, bytesReceived: number) =>
      signaling.current?.send({
        type: 'usage.report',
        reportId,
        bytesReceived,
      }),
    updateSettings: (settings: MeetRoomSettings) =>
      signaling.current?.send({ type: 'room.settings.update', settings }),
    controlRecording: async (
      state: 'starting' | 'recording' | 'stopping' | 'idle' | 'error',
      sessionId?: string
    ) => {
      if (!signaling.current?.isOpen) throw new Error('signaling_closed');
      await signaling.current.request({
        type: 'recording.state',
        state,
        recordingSessionId: sessionId,
      });
    },
    renameMeeting: (title: string) => signaling.current?.announceTitle(title),
    sendChat: async (body: string, attachmentIds?: string[]) => {
      const text = body.trim();
      if (!text || !signaling.current?.isOpen)
        throw new Error('signaling_closed');
      return signaling.current.request<{ id: string }>({
        type: 'chat.message',
        body: text,
        attachmentIds,
      });
    },
    raiseHand: (raised: boolean) =>
      signaling.current?.send({ type: 'hand.raise', raised }),
    decideAdmission: (userId: string, admit: boolean) =>
      signaling.current?.send({ type: 'admission.decide', userId, admit }),
    muteParticipant: (userId: string, kinds: MeetRealtimeTrackKind[]) =>
      signaling.current?.send({ type: 'participant.mute', userId, kinds }),
    removeParticipant: (userId: string) =>
      signaling.current?.send({ type: 'participant.remove', userId }),
    forgetParticipant: (userId: string) =>
      signaling.current?.send({ type: 'admission.forget', userId }),
    shareNotes: (shareNotes: boolean) =>
      signaling.current?.send({
        type: 'room.settings.update',
        settings: { shareNotes },
      }),
    endMeeting: async () => {
      if (!signaling.current?.isOpen) throw new Error('signaling_closed');
      await signaling.current.request({ type: 'room.end' });
    },
    react: (reaction: MeetReaction) =>
      signaling.current?.send({ type: 'reaction.send', reaction }),
    setRecordingState: (state: 'recording' | 'idle', sessionId?: string) =>
      signaling.current?.send({
        type: 'recording.state',
        state,
        recordingSessionId: sessionId,
      }),
  };
}

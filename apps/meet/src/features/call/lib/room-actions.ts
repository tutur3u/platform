import type {
  MeetReaction,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import type { MeetSignaling } from './signaling';

export function createRoomActions(signaling: {
  current: MeetSignaling | null;
}) {
  return {
    renameMeeting: (title: string) => signaling.current?.announceTitle(title),
    sendChat: (body: string) => {
      const text = body.trim();
      if (text) signaling.current?.send({ type: 'chat.message', body: text });
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

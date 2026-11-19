import { useEffect } from 'react';
import { type CallState, localMediaLocks } from './call-state';
import type {
  MeetMediaState,
  MeetReaction,
  MeetRealtimeTrackKind,
  MeetRoomSettings,
} from '@tuturuuu/realtime/meet';
import { sendRecoverableChat } from './chat-delivery';
import { prepareParticipantName } from './participant-name';
import type { MeetSignaling } from './signaling';

export function createRoomActions(
  signaling: {
    current: MeetSignaling | null;
  },
  stageWindow?: { current: StageVideoWindow | null }
) {
  let assistantAudio:
    | {
        microphoneEnabled: boolean;
        speakerEnabled: boolean;
        sessionId?: string;
      }
    | undefined;
  let customDisplayName: string | undefined;
  const pendingChat = new Map<string, string>();
  return {
    setStageVideoWindow: (
      cameraUserIds: string[],
      spotlightUserId?: string
    ) => {
      if (!stageWindow) return;
      const previous = stageWindow.current;
      if (
        previous?.spotlightUserId === spotlightUserId &&
        previous?.cameraUserIds.join(',') === cameraUserIds.join(',')
      )
        return;
      stageWindow.current = {
        cameraUserIds,
        spotlightUserId,
        changedAt: Date.now(),
      };
    },
    admitAllWaiting: () =>
      signaling.current?.send({ type: 'admission.decideAll', admit: true }),
    denyAllWaiting: () =>
      signaling.current?.send({ type: 'admission.decideAll', admit: false }),
    setMediaOverride: (
      userId: string,
      override: NonNullable<MeetRoomSettings['mediaOverrides']>[string] | null
    ) =>
      signaling.current?.send({ type: 'room.mediaOverride', userId, override }),
    setDisplayName: (displayName: string, media?: MeetMediaState) => {
      const trimmed = prepareParticipantName(displayName);
      if (!trimmed) return;
      customDisplayName = trimmed;
      signaling.current?.send({
        type: 'presence.join',
        displayName: trimmed,
        ...(media ? { media } : {}),
      });
    },
    replayPresenceJoin: (media: MeetMediaState) =>
      signaling.current?.send({
        type: 'presence.join',
        media,
        ...(customDisplayName ? { displayName: customDisplayName } : {}),
      }),
    replayAssistantAudio: () => {
      if (assistantAudio)
        signaling.current?.send({
          type: 'assistant.preferences',
          audio: assistantAudio,
        });
    },
    setAssistantAudio: (audio: {
      sessionId?: string;
      microphoneEnabled: boolean;
      speakerEnabled: boolean;
    }) => {
      assistantAudio = audio;
      signaling.current?.send({ type: 'assistant.preferences', audio });
    },
    reportUsage: (reportId: string, bytesReceived: number) =>
      signaling.current?.send({
        type: 'usage.report',
        reportId,
        bytesReceived,
      }),
    updateSettings: (settings: Partial<MeetRoomSettings>) =>
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
      if (!text) throw new Error('empty_message');
      if (!signaling.current) throw new Error('signaling_closed');
      const key = JSON.stringify([text, attachmentIds ?? []]);
      const id = pendingChat.get(key) ?? crypto.randomUUID();
      // A failed attempt can be retried once; concurrent new sends stay distinct.
      pendingChat.delete(key);
      try {
        return await sendRecoverableChat(
          signaling.current,
          text,
          attachmentIds,
          undefined,
          id
        );
      } catch (error) {
        pendingChat.set(key, id);
        if (pendingChat.size > 20)
          pendingChat.delete(pendingChat.keys().next().value!);
        throw error;
      }
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
    commandClassTimer: (
      action: 'start' | 'pause' | 'resume' | 'stop',
      durationMs?: number
    ) =>
      signaling.current?.send({
        type: 'classTimer.command',
        action,
        ...(durationMs === undefined ? {} : { durationMs }),
      }),
    setRecordingState: (state: 'recording' | 'idle', sessionId?: string) =>
      signaling.current?.send({
        type: 'recording.state',
        state,
        recordingSessionId: sessionId,
      }),
  };
}

export type StageVideoWindow = {
  cameraUserIds: string[];
  spotlightUserId?: string;
  changedAt: number;
};
type RoomControls = {
  actions: ReturnType<typeof createRoomActions>;
  settings: MeetRoomSettings;
  canManage: boolean;
  isHost: boolean;
  locked: { audio: boolean; video: boolean; screen: boolean };
  bulkAdmission?: { admitted: number; denied: number; remaining: number };
};

// The call shell renders the stage, panel, and toolbar as siblings.
const controls = new Map<RoomControls['actions'], RoomControls>();
const listeners = new Set<() => void>();
export function subscribeRoomControls(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function readRoomControls(
  decide?: RoomControls['actions']['decideAdmission']
) {
  if (decide)
    return [...controls.values()].find(
      (room) => room.actions.decideAdmission === decide
    );
  return controls.size === 1 ? controls.values().next().value : undefined;
}
export function syncRoomControls(room: RoomControls) {
  controls.set(room.actions, room);
  for (const listener of listeners) listener();
}
export function removeRoomControls(actions: RoomControls['actions']) {
  controls.delete(actions);
  for (const listener of listeners) listener();
}

export function useRoomControlBridge(
  actions: ReturnType<typeof createRoomActions>,
  state: CallState
) {
  const locks = localMediaLocks(state);
  useEffect(() => {
    if (state.admission !== 'admitted' || state.ended) return;
    syncRoomControls({
      actions,
      settings: state.settings,
      canManage: state.canManageParticipants ?? state.role === 'host',
      isHost: state.role === 'host',
      locked: { audio: locks.audio, video: locks.video, screen: locks.screen },
      bulkAdmission: state.bulkAdmission,
    });
    return () => removeRoomControls(actions);
  }, [
    actions,
    state.admission,
    state.ended,
    state.settings,
    state.role,
    state.canManageParticipants,
    state.bulkAdmission,
    locks.audio,
    locks.video,
    locks.screen,
  ]);

  return locks;
}

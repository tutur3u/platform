import type { LiveQaCommand } from '../tools/live-activities/qa/qa-store';
import { useEffect } from 'react';
import { type CallState, localMediaLocks } from './call-state';
import type {
  MeetMediaState,
  MeetNavigationMode,
  MeetReaction,
  MeetRealtimeClientMessage,
  MeetRealtimeTrackKind,
  MeetRoomMediaQualitySummary,
  MeetRoomSettings,
  MeetRoomView,
} from '@tuturuuu/realtime/meet';
import { DISPLAY_NAME_LOCKED } from '@tuturuuu/realtime/meet';
import { sendRecoverableChat } from './chat-delivery';
import { createMediaPolicy } from './media-policy';
import { prepareParticipantName } from './participant-name';
import type { MeetSignaling } from './signaling';

/**
 * Whether the settings the room holds include every value that was asked for.
 * A room that predates a setting accepts the request and drops the value.
 */
export function settingsApplied(
  asked: Partial<MeetRoomSettings>,
  held: MeetRoomSettings
) {
  return (Object.keys(asked) as (keyof MeetRoomSettings)[]).every(
    (key) =>
      asked[key] === undefined ||
      JSON.stringify(asked[key]) === JSON.stringify(held[key])
  );
}

export function createRoomActions(
  signaling: {
    current: MeetSignaling | null;
  },
  stageWindow?: { current: StageVideoWindow | null }
) {
  let settingsFailed: ((error: Error) => void) | undefined;
  let assistantAudio:
    | {
        microphoneEnabled: boolean;
        speakerEnabled: boolean;
        sessionId?: string;
      }
    | undefined;
  let customDisplayName: string | undefined;
  /**
   * A name saved to the profile during the call. Reconnects replay it through
   * `participant.rename`, so the lobby name never overwrites it, until the
   * room reports the name as locked.
   */
  let savedRename: string | undefined;
  const sendRename = async (connection: MeetSignaling, name: string) => {
    try {
      const reply = await connection.request<{ displayName: string }>({
        type: 'participant.rename',
        displayName: name,
      });
      if (savedRename === name) savedRename = reply.displayName;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === DISPLAY_NAME_LOCKED &&
        savedRename === name
      )
        savedRename = undefined;
      throw error;
    }
  };
  const pendingChat = new Map<string, string>();
  // Measured outside React state so tile resizes never re-render the room.
  const tileHeights = new Map<string, number>();
  const mediaPolicy = createMediaPolicy();
  return {
    mediaPolicy,
    sendLiveQa: (message: LiveQaCommand) => signaling.current?.send(message),
    sendSharedTool: (message: MeetRealtimeClientMessage) => {
      const connection = signaling.current;
      if (!connection?.isOpen) return false;
      connection.send(message);
      return true;
    },
    reportTileHeight: (userId: string, devicePx: number | null) => {
      if (devicePx === null) tileHeights.delete(userId);
      else tileHeights.set(userId, devicePx);
    },
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
        tileHeights,
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
    /** Shows a name on this device's own tile before the room confirms it. */
    previewDisplayName: (userId: string, displayName: string) =>
      signaling.current?.applyLocal({
        type: 'participant.renamed',
        displayName,
        userId,
      }),
    /**
     * Renames this participant for everyone in the room. Rejects with the
     * room's error (for example `display_name_locked`) so the caller can roll
     * back its preview.
     */
    renameSelf: async (displayName: string) => {
      const name = prepareParticipantName(displayName);
      if (!name) throw new Error('display_name_empty');
      // The profile already holds this name, so a reconnect replays it even
      // when this request never reaches the room.
      savedRename = name;
      const connection = signaling.current;
      if (!connection?.isOpen) throw new Error('signaling_closed');
      await sendRename(connection, name);
    },
    replayPresenceJoin: (media: MeetMediaState) => {
      const connection = signaling.current;
      if (!connection) return;
      const rename = savedRename;
      connection.send({
        type: 'presence.join',
        media,
        ...(customDisplayName && !rename
          ? { displayName: customDisplayName }
          : {}),
      });
      if (rename) void sendRename(connection, rename).catch(() => undefined);
    },
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
    /** Send this device's media health for the last interval to the room. */
    reportMediaQuality: () =>
      signaling.current?.send({
        type: 'media.quality',
        sample: mediaPolicy.quality.take(mediaPolicy.getSnapshot()),
      }),
    readMediaQuality: () =>
      signaling.current?.request<MeetRoomMediaQualitySummary>({
        type: 'media.quality.read',
      }) ?? Promise.reject(new Error('signaling_closed')),
    reportUsage: (reportId: string, bytesReceived: number) =>
      signaling.current?.send({
        type: 'usage.report',
        reportId,
        bytesReceived,
      }),
    /**
     * Reports host settings the room did not take (closed connection, refusal,
     * no answer, or a value the room dropped), so the host can see them.
     */
    watchSettingsFailures: (handler: (error: Error) => void) => {
      settingsFailed = handler;
      return () => {
        if (settingsFailed === handler) settingsFailed = undefined;
      };
    },
    updateSettings: async (settings: Partial<MeetRoomSettings>) => {
      try {
        const connection = signaling.current;
        if (!connection?.isOpen) throw new Error('signaling_closed');
        const held = await connection.request<MeetRoomSettings>({
          type: 'room.settings.update',
          settings,
        });
        if (!settingsApplied(settings, held))
          throw new Error('settings_not_applied');
      } catch (error) {
        settingsFailed?.(
          error instanceof Error ? error : new Error('settings_failed')
        );
      }
    },
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
    promoteParticipant: (userId: string) =>
      signaling.current?.send({ type: 'participant.promote', userId }),
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
    /** Follow and Summon: relay this person's view to chosen people. */
    requestNavigation: (request: {
      mode: MeetNavigationMode;
      targets: 'everyone' | string[];
      view?: MeetRoomView;
    }) =>
      signaling.current?.send({
        type: 'navigation.request',
        requestId: crypto.randomUUID(),
        ...request,
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
  /** Rendered camera tile heights in device pixels, by participant. */
  tileHeights?: ReadonlyMap<string, number>;
  /** Thumbnail mode: every non-spotlit camera uses the lowest layer. */
  smallMode?: boolean;
  /** False while remote screen video is paused; audio is unaffected. */
  screenVideo?: boolean;
};
type RoomControls = {
  actions: ReturnType<typeof createRoomActions>;
  settings: MeetRoomSettings;
  canManage: boolean;
  isHost: boolean;
  classViewersAvailable?: boolean;
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
      classViewersAvailable: state.classViewersAvailable,
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
    state.classViewersAvailable,
    state.bulkAdmission,
    locks.audio,
    locks.video,
    locks.screen,
  ]);

  return locks;
}

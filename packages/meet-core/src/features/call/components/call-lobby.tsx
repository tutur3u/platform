'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  MiraJoinBox,
  useRememberMiraJoin,
} from '../../live-assistant/mira-join-box';
import { peekMiraJoinChoice } from '../../live-assistant/mira-join-choice';
import type { MeetRoomController } from '../lib/room-controller';
import { GuestLobbyUpgrade } from './guest-lobby-upgrade';
import { Lobby, type LobbyParticipant } from './lobby';
import { useRoomMiraJoinSeed } from './use-room-mira';

type MediaDevice = 'microphone' | 'camera';

export function ConnectedLobby({
  room,
  participants,
  defaultAvatarUrl,
  defaultDisplayName,
  canReadWorkspace,
  joined,
  meetingName,
  transcriptionNotice,
  outputDeviceId,
  onOutputDeviceChange,
  prepareJoin,
  runMediaAction,
  onJoined,
  onLeave,
  onRetry,
  miraMeetingId,
}: {
  room: MeetRoomController;
  /**
   * Shows the Mira box above Join where room Mira is available, seeded from
   * an earlier join screen or else the workspace default.
   */
  miraMeetingId?: string;
  participants: readonly LobbyParticipant[];
  defaultAvatarUrl?: string;
  defaultDisplayName: string;
  canReadWorkspace: boolean;
  /** Join was pressed; the room owns the devices (lobby shown only if held). */
  joined: boolean;
  meetingName: string;
  transcriptionNotice?: string;
  outputDeviceId: string;
  onOutputDeviceChange: (deviceId: string) => void;
  prepareJoin: (audioEnabled: boolean) => boolean;
  runMediaAction: (
    action: () => Promise<void>,
    device: MediaDevice
  ) => Promise<void>;
  onJoined: () => void;
  onLeave: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('meet.call');
  const selected = room.getSelectedDevices();
  // Last name sent with presence.join, so a blur followed by join (or a
  // blur without edits) does not resend the same name.
  const sentDisplayName = useRef<string | null>(null);
  // The Mira box state; null until seeded, so the box renders on the client.
  const [miraTicked, setMiraTicked] = useState<boolean | null>(null);
  const rememberMira = useRememberMiraJoin();
  // The acceptance revision open on the join screen, kept by the Mira box.
  const miraRevision = useRef(0);
  const sendDisplayName = (name: string) => {
    if (name === sentDisplayName.current) return;
    sentDisplayName.current = name;
    room.setDisplayName(name, room.media);
  };

  return (
    <Lobby
      avatarUrl={defaultAvatarUrl}
      connectionStatus={room.connectionStatus}
      viewer={room.state.role === 'viewer'}
      presenceOnly={room.state.settings.transport === 'presence'}
      onPresenceChange={
        room.state.role === 'host'
          ? (enabled) =>
              room.updateSettings({ transport: enabled ? 'presence' : 'media' })
          : undefined
      }
      capturePending={room.state.role === null}
      defaultDisplayName={defaultDisplayName}
      error={room.state.error}
      initialAudioDeviceId={selected.audio}
      initialVideoDeviceId={selected.video}
      isGuest={!canReadWorkspace}
      isJoining={room.state.admission === 'connecting'}
      joined={joined}
      meetingName={room.state.title ?? meetingName}
      onDisplayNameChange={sendDisplayName}
      onJoin={({
        audioDeviceId,
        audioEnabled,
        displayName,
        outputDeviceId: nextOutputDeviceId,
        previewStream,
        videoDeviceId,
        videoEnabled,
      }) => {
        onOutputDeviceChange(nextOutputDeviceId);
        // Recorded after admission; until then the participant is off.
        if (miraMeetingId && miraTicked !== null)
          void rememberMira(
            miraMeetingId,
            miraTicked,
            miraRevision.current
          ).catch(() => undefined);
        if (!canReadWorkspace || displayName !== defaultDisplayName) {
          sendDisplayName(displayName);
        }
        const enableMicrophone = prepareJoin(audioEnabled);
        onJoined();
        void Promise.all([
          room.selectDevice('audio', audioDeviceId),
          room.selectDevice('video', videoDeviceId),
        ])
          .then(() => room.adoptPreview(previewStream))
          .then(() =>
            Promise.all([
              ...(enableMicrophone
                ? [runMediaAction(room.toggleMicrophone, 'microphone')]
                : []),
              ...(videoEnabled
                ? [runMediaAction(room.toggleCamera, 'camera')]
                : []),
            ])
          )
          .catch(() => toast.error(t('media_failed')));
      }}
      onLeave={onLeave}
      onOutputDeviceChange={onOutputDeviceChange}
      onRetry={onRetry}
      outputDeviceId={outputDeviceId}
      participants={participants}
      transcriptionNotice={transcriptionNotice}
      waiting={room.state.admission === 'waiting'}
      waitingExtra={
        <GuestLobbyUpgrade room={room} displayName={defaultDisplayName} />
      }
      joinExtra={
        miraMeetingId ? (
          <LobbyMiraBox
            meetingId={miraMeetingId}
            ticked={miraTicked}
            onTickedChange={setMiraTicked}
            revisionRef={miraRevision}
          />
        ) : undefined
      }
    />
  );
}

/**
 * Reads the join box default for one meeting and seeds the box once: a later
 * default (a refetch, or the host changing the setting) never overwrites a
 * box the participant already toggled. An earlier join screen's choice wins.
 */
function LobbyMiraBox({
  meetingId,
  ticked,
  onTickedChange,
  revisionRef,
}: {
  meetingId: string;
  ticked: boolean | null;
  onTickedChange: (ticked: boolean) => void;
  revisionRef: MutableRefObject<number>;
}) {
  const seed = useRoomMiraJoinSeed(meetingId);
  const seeded = useRef(false);
  const seedTicked = seed?.ticked;
  const seedRevision = seed?.revision;
  useEffect(() => {
    if (seedRevision !== undefined) revisionRef.current = seedRevision;
  }, [seedRevision, revisionRef]);
  useEffect(() => {
    if (seeded.current || seedTicked === undefined) return;
    seeded.current = true;
    onTickedChange(peekMiraJoinChoice(meetingId)?.ticked ?? seedTicked);
  }, [meetingId, seedTicked, onTickedChange]);
  if (ticked === null) return null;
  return <MiraJoinBox checked={ticked} onCheckedChange={onTickedChange} />;
}

'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  MiraJoinBox,
  useRememberMiraJoin,
} from '../../live-assistant/mira-join-box';
import { peekMiraJoinChoice } from '../../live-assistant/mira-join-choice';
import { useRoomMiraJoinDefault } from './use-room-mira';
import type { MeetRoomController } from '../lib/room-controller';
import { GuestLobbyUpgrade } from './guest-lobby-upgrade';
import { Lobby, type LobbyParticipant } from './lobby';

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
  // Seeded after mount, so server and client render the same markup: an
  // earlier join screen's choice wins over the workspace default.
  const [miraTicked, setMiraTicked] = useState<boolean | null>(null);
  const miraDefault = useRoomMiraJoinDefault(miraMeetingId);
  useEffect(() => {
    if (!miraMeetingId || miraDefault === undefined) return;
    setMiraTicked(peekMiraJoinChoice(miraMeetingId)?.ticked ?? miraDefault);
  }, [miraMeetingId, miraDefault]);
  const rememberMira = useRememberMiraJoin();
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
          void rememberMira(miraMeetingId, miraTicked).catch(() => undefined);
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
        miraTicked === null ? undefined : (
          <MiraJoinBox checked={miraTicked} onCheckedChange={setMiraTicked} />
        )
      }
    />
  );
}

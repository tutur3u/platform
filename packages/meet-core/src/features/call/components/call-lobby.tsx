'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
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
}: {
  room: MeetRoomController;
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
  const sendDisplayName = (name: string) => {
    if (name === sentDisplayName.current) return;
    sentDisplayName.current = name;
    room.setDisplayName(name, room.media);
  };

  return (
    <Lobby
      avatarUrl={defaultAvatarUrl}
      connectionStatus={room.connectionStatus}
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
    />
  );
}

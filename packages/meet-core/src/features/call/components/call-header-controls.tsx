'use client';
import { MeetLivePanel } from '@tuturuuu/meet-core/features/live-assistant/live-panel';
import type { ComponentProps } from 'react';
import { TranscriptControls } from '../../meeting-ai/transcript-controls';
import type { CallState } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import type { PlaybackTrial } from '../same-room-audio/use-playback-trial';
import { roomActivitySettings } from './call-activity-settings';
import { CallClock } from './call-clock';
import { CallHeaderActions } from './call-header-actions';
import { CallSettings } from './call-settings';
import { PlaybackVolumeControl } from './playback-volume';
import { ShareMeetingButton } from './share-meeting';
import { SharedAudioControl } from './shared-audio-control';

type Media = 'microphone' | 'camera' | 'screen';

/** Builds the call header's controls from the shell's room state. */
export function CallHeaderControls({
  accountId,
  ai,
  busyDevices,
  canManage,
  canReadWorkspace,
  guest,
  meetingId,
  meetingName,
  notifications,
  onLeave,
  onOutput,
  outputDeviceId,
  participants,
  playbackTrial,
  presenceOnly,
  room,
  roomTools,
  runMediaAction,
  sharedAudio,
  state,
  telemetry,
  wsId,
}: {
  accountId: string;
  ai: ComponentProps<typeof CallSettings>['ai'];
  busyDevices: { microphone?: boolean };
  canManage: boolean;
  canReadWorkspace: boolean;
  /** The viewer has no account, so transcript consent offers the guest path. */
  guest: boolean;
  meetingId: string;
  meetingName: string;
  notifications: { sound: boolean; toggleSound: () => void };
  onLeave: () => void;
  onOutput: (deviceId: string) => void;
  outputDeviceId: string;
  participants: ComponentProps<typeof PlaybackVolumeControl>['participants'];
  playbackTrial?: PlaybackTrial;
  presenceOnly: boolean;
  room: MeetRoomController;
  roomTools: { canConfigure: boolean };
  runMediaAction: (action: () => Promise<void>, device: Media) => Promise<void>;
  sharedAudio: ComponentProps<typeof SharedAudioControl>['audio'] & {
    microphonePaused: boolean;
  };
  state: CallState;
  telemetry: ComponentProps<typeof CallSettings>['telemetry'];
  wsId: string;
}) {
  return (
    <CallHeaderActions
      notice={
        <TranscriptControls
          guest={guest}
          meetingId={meetingId}
          room={room}
          wsId={wsId}
        />
      }
      mira={
        presenceOnly ? undefined : (
          <MeetLivePanel
            wsId={wsId}
            accountId={accountId}
            key="live-assistant"
            onLeave={onLeave}
            room={room}
            meetingId={meetingId}
            outputDeviceId={outputDeviceId}
            canManage={canManage}
            audioSuppressed={sharedAudio.microphonePaused}
          />
        )
      }
      volume={
        presenceOnly ? undefined : (
          <PlaybackVolumeControl
            participants={participants}
            selfUserId={state.selfUserId}
          />
        )
      }
      sharedAudio={
        presenceOnly ? undefined : (
          <SharedAudioControl
            audio={sharedAudio}
            busy={!!busyDevices.microphone}
            onShare={() => void runMediaAction(sharedAudio.share, 'microphone')}
            onUseMicrophone={() =>
              void runMediaAction(sharedAudio.useOwnMicrophone, 'microphone')
            }
          />
        )
      }
      settings={
        <CallSettings
          meetingId={meetingId}
          wsId={wsId}
          room={room}
          telemetry={telemetry}
          ai={ai}
          canManage={canManage}
          sound={notifications.sound}
          onSound={notifications.toggleSound}
          outputDeviceId={outputDeviceId}
          playbackTrial={playbackTrial}
          onOutput={onOutput}
          activities={
            roomTools.canConfigure ? roomActivitySettings(room) : undefined
          }
        />
      }
      clock={<CallClock meetingId={meetingId} state={state} />}
      share={
        <ShareMeetingButton
          mail={{
            workspaceId: wsId,
            actorId: accountId,
            canReadWorkspace,
            canManage,
          }}
          meetingId={meetingId}
          meetingName={room.state.title ?? meetingName}
        />
      }
    />
  );
}

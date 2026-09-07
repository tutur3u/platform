import type {
  MeetMediaState,
  MeetRealtimeTrackKind,
} from '@tuturuuu/realtime/meet';
import type { CallState } from './call-state';
import type { CameraLook } from './camera-effects';
import type { MediaDiagnostics } from './media-diagnostics';
import type { RemoteMedia } from './remote-streams';
import type { createRoomActions } from './room-actions';
import type { MeetSignalingStatus } from './signaling';

export interface UseMeetRoomOptions {
  meetingId: string;
  realtimeUrl: string;
  token: string;
  wsId: string;
}

export interface MeetRoomController
  extends ReturnType<typeof createRoomActions> {
  leave: () => void;
  adoptPreview: (stream: MediaStream | null) => Promise<void>;
  cameraLook: CameraLook;
  setCameraLook: (look: CameraLook) => Promise<void>;
  remoteMedia: RemoteMedia;
  screenStream: MediaStream | null;
  connectionStatus: MeetSignalingStatus;
  getMediaDiagnostics: () => Promise<MediaDiagnostics>;
  reconnectMedia: () => void;
  decideAdmission: (userId: string, admit: boolean) => void;
  localStream: MediaStream | null;
  localPreview: MediaStream | null;
  media: MeetMediaState;
  muteParticipant: (userId: string, kinds: MeetRealtimeTrackKind[]) => void;
  raiseHand: (raised: boolean) => void;
  removeParticipant: (userId: string) => void;
  remoteStreams: Record<string, MediaStream>;
  sendChat: (body: string) => void;
  setRecordingState: (state: 'recording' | 'idle', sessionId?: string) => void;
  state: CallState;
  toggleCamera: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

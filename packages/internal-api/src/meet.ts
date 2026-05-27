import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type MeetRealtimeRole = 'host' | 'speaker' | 'viewer';
export type MeetRealtimeRoomMode = 'call' | 'webinar' | 'stream';

export type WorkspaceMeetingRealtimeTokenRequest = {
  mode?: MeetRealtimeRoomMode;
  role?: MeetRealtimeRole;
};

export type WorkspaceMeetingRealtimeTokenResponse = {
  expiresAt: string;
  limits: {
    maxPublishers: number;
    maxViewers: number;
    video: {
      defaultCameraEnabled: boolean;
      maxFrameRate: number;
      maxHeight: number;
      maxWidth: number;
    };
  };
  mode: MeetRealtimeRoomMode;
  realtimeUrl: string;
  role: MeetRealtimeRole;
  roomId: string;
  token: string;
};

export async function createWorkspaceMeetingRealtimeToken(
  wsId: string,
  meetingId: string,
  payload: WorkspaceMeetingRealtimeTokenRequest = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceMeetingRealtimeTokenResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/meetings/${encodePathSegment(
      meetingId
    )}/realtime-token`,
    {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

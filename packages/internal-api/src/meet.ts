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

export type WorkspaceMeetingStream = {
  createdAt: string;
  endedAt: string | null;
  id: string;
  liveInputUid: string;
  playbackUrl: string;
  publishUrl?: string;
  status: string;
  updatedAt: string;
};

export type WorkspaceMeetingStreamResponse = {
  stream: WorkspaceMeetingStream | null;
};

export type CreateWorkspaceMeetingStreamResponse = {
  created: boolean;
  stream: WorkspaceMeetingStream;
};

export type UpdateWorkspaceMeetingStreamPayload = {
  action: 'resume' | 'stop';
};

export type UpdateWorkspaceMeetingStreamResponse = {
  created?: boolean;
  stream: WorkspaceMeetingStream;
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

function getWorkspaceMeetingStreamPath(wsId: string, meetingId: string) {
  return `/api/v1/workspaces/${encodePathSegment(
    wsId
  )}/meetings/${encodePathSegment(meetingId)}/stream`;
}

export async function getWorkspaceMeetingStream(
  wsId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceMeetingStreamResponse>(
    getWorkspaceMeetingStreamPath(wsId, meetingId)
  );
}

export async function createWorkspaceMeetingStream(
  wsId: string,
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    options
  ).json<CreateWorkspaceMeetingStreamResponse>(
    getWorkspaceMeetingStreamPath(wsId, meetingId),
    {
      method: 'POST',
    }
  );
}

export async function updateWorkspaceMeetingStream(
  wsId: string,
  meetingId: string,
  payload: UpdateWorkspaceMeetingStreamPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    options
  ).json<UpdateWorkspaceMeetingStreamResponse>(
    getWorkspaceMeetingStreamPath(wsId, meetingId),
    {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

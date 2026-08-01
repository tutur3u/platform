import type {
  MeetFinalizedTimeframe,
  MeetTogetherPlan,
  PlanUser,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
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

export interface MeetPlanSnapshot {
  plan: MeetTogetherPlan;
  users: PlanUser[];
  timeblocks: Timeblock[];
  finalizedTimeframes: MeetFinalizedTimeframe[];
  polls: unknown;
  viewer: {
    id: string | null;
    isCreator: boolean;
  };
  revision: string;
}

export interface MeetAvailabilityIdentity {
  guestId?: string;
  passwordHash?: string;
}

export interface ReplaceMeetAvailabilityPayload
  extends MeetAvailabilityIdentity {
  timeblocks: Array<
    Pick<Timeblock, 'date' | 'start_time' | 'end_time' | 'tentative'>
  >;
}

export interface ReplaceMeetFinalizationPayload {
  timeframes: Array<{
    startAt: string;
    endAt: string;
  }>;
}

export interface CreateMeetPlanPayload {
  name?: string;
  dates: string[];
  start_time: string;
  end_time: string;
  timezone?: string;
  duration_minutes: number;
  ws_id?: string;
  is_public?: boolean;
  where_to_meet?: boolean;
  description?: string;
  agenda_content?: unknown;
}

export type UpdateMeetPlanPayload = Partial<CreateMeetPlanPayload>;

function getMeetPlanPath(planId: string) {
  return `/api/v1/meet/plans/${encodePathSegment(planId)}`;
}

export async function createMeetPlan(
  payload: CreateMeetPlanPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string }>(
    '/api/v1/meet/plans',
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function updateMeetPlan(
  planId: string,
  payload: UpdateMeetPlanPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetPlanSnapshot>(
    getMeetPlanPath(planId),
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function deleteMeetPlan(
  planId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<void>(getMeetPlanPath(planId), {
    method: 'DELETE',
  });
}

export async function getMeetPlanSnapshot(
  planId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetPlanSnapshot>(
    getMeetPlanPath(planId),
    { cache: 'no-store' }
  );
}

export async function replaceMeetAvailability(
  planId: string,
  payload: ReplaceMeetAvailabilityPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetPlanSnapshot>(
    `${getMeetPlanPath(planId)}/availability`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export async function finalizeMeetPlan(
  planId: string,
  payload: ReplaceMeetFinalizationPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetPlanSnapshot>(
    `${getMeetPlanPath(planId)}/finalization`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export async function reopenMeetPlan(
  planId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetPlanSnapshot>(
    `${getMeetPlanPath(planId)}/finalization`,
    { method: 'DELETE' }
  );
}

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

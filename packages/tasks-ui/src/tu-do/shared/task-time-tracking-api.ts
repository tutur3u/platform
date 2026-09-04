import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';
import type { SessionWithRelations } from '@tuturuuu/types';

interface RunningTimeTrackingSessionResponse {
  session: SessionWithRelations | null;
}

interface StartTaskTimeTrackingSessionResponse {
  session: SessionWithRelations;
}

interface StartTaskTimeTrackingSessionInput {
  taskId: string;
  taskName: string;
  description?: string | null;
  categoryId?: string | null;
}

export const runningTimeSessionQueryKey = (workspaceId: string) =>
  ['running-time-session', workspaceId] as const;

export const runningUserTimeSessionQueryKey = (workspaceId: string) =>
  ['running-time-session', 'user', workspaceId] as const;

export async function getRunningTaskTimeTrackingSession(
  workspaceId: string,
  options?: { scope?: 'user' | 'workspace' }
) {
  const client = getInternalApiClient();
  const payload = await client.json<RunningTimeTrackingSessionResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/sessions`,
    {
      method: 'GET',
      cache: 'no-store',
      query: {
        type: 'running',
        ...(options?.scope === 'user' ? { scope: 'user' } : {}),
      },
    }
  );

  return payload.session ?? null;
}

export async function stopTaskTimeTrackingSession(
  workspaceId: string,
  sessionId: string
) {
  const client = getInternalApiClient();
  const payload = await client.json<StartTaskTimeTrackingSessionResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/sessions/${encodePathSegment(sessionId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'stop' }),
    }
  );

  if (!payload.session) {
    throw new Error('The timer stopped without returning its session.');
  }

  return payload.session;
}

export async function startTaskTimeTrackingSession(
  workspaceId: string,
  input: StartTaskTimeTrackingSessionInput
) {
  const client = getInternalApiClient();
  const payload = await client.json<StartTaskTimeTrackingSessionResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/sessions`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Working on: ${input.taskName}`,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        taskId: input.taskId,
      }),
    }
  );

  if (!payload.session) {
    throw new Error('The timer started without returning its active session.');
  }

  return payload.session;
}

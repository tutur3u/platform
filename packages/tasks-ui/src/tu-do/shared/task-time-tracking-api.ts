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

export async function getRunningTaskTimeTrackingSession(workspaceId: string) {
  const client = getInternalApiClient();
  const payload = await client.json<RunningTimeTrackingSessionResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/time-tracking/sessions`,
    {
      method: 'GET',
      cache: 'no-store',
      query: { type: 'running' },
    }
  );

  return payload.session ?? null;
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

import type {
  HabitTracker,
  HabitTrackerDetailResponse,
  HabitTrackerEntry,
  HabitTrackerEntryInput,
  HabitTrackerInput,
  HabitTrackerListResponse,
  HabitTrackerScope,
  HabitTrackerStreakAction,
  HabitTrackerStreakActionInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export async function listWorkspaceHabitTrackers(
  wsId: string,
  query?: {
    scope?: HabitTrackerScope;
    userId?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<HabitTrackerListResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceHabitTracker(
  wsId: string,
  input: HabitTrackerInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ tracker: HabitTracker }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  return payload.tracker;
}

export async function getWorkspaceHabitTracker(
  wsId: string,
  trackerId: string,
  query?: {
    scope?: HabitTrackerScope;
    userId?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<HabitTrackerDetailResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceHabitTracker(
  wsId: string,
  trackerId: string,
  input: Partial<HabitTrackerInput>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ tracker: HabitTracker }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  return payload.tracker;
}

export async function deleteWorkspaceHabitTracker(
  wsId: string,
  trackerId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceHabitTrackerEntries(
  wsId: string,
  trackerId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    entries: Array<
      HabitTrackerEntry & {
        member?: HabitTrackerDetailResponse['entries'][number]['member'];
      }
    >;
  }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}/entries`,
    {
      cache: 'no-store',
    }
  );

  return payload.entries ?? [];
}

export async function createWorkspaceHabitTrackerEntry(
  wsId: string,
  trackerId: string,
  input: HabitTrackerEntryInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ entry: HabitTrackerEntry }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}/entries`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  return payload.entry;
}

export async function updateWorkspaceHabitTrackerEntry(
  wsId: string,
  trackerId: string,
  entryId: string,
  input: Partial<HabitTrackerEntryInput>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ entry: HabitTrackerEntry }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}/entries/${encodePathSegment(entryId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  return payload.entry;
}

export async function deleteWorkspaceHabitTrackerEntry(
  wsId: string,
  trackerId: string,
  entryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}/entries/${encodePathSegment(entryId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceHabitTrackerStreakAction(
  wsId: string,
  trackerId: string,
  input: HabitTrackerStreakActionInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ action: HabitTrackerStreakAction }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habit-trackers/${encodePathSegment(trackerId)}/streak-actions`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  return payload.action;
}

import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type WorkspacePersonFields = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type WorkspacePerson = WorkspacePersonFields &
  ({ kind: 'contact'; linkedUserId: string | null } | { kind: 'member' });

export type WorkspacePeopleSearchParams = {
  query: string;
  limit?: number;
};

export type WorkspacePeopleSearchResponse = {
  data: WorkspacePerson[];
};

export async function searchWorkspacePeople(
  workspaceId: string,
  { query, limit }: WorkspacePeopleSearchParams,
  options?: InternalApiClientOptions
): Promise<WorkspacePeopleSearchResponse> {
  const searchParams = new URLSearchParams({ q: query });
  if (limit !== undefined) searchParams.set('limit', String(limit));

  return getInternalApiClient(options).json<WorkspacePeopleSearchResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/people?${searchParams}`,
    { cache: 'no-store' }
  );
}

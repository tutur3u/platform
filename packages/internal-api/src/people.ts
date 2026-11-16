import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type {
  ContactCreateOperationInput,
  ContactCreateOperationResult,
} from '@tuturuuu/types/primitives/contact-create-operation';

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

function contactOperationPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/people/contacts`;
}

export function getContactCreateCapability(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ canCreate: true }>(
    contactOperationPath(workspaceId),
    { cache: 'no-store' }
  );
}

export function createSenderContact(
  workspaceId: string,
  input: ContactCreateOperationInput,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ContactCreateOperationResult>(
    contactOperationPath(workspaceId),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export function getSenderContactOperation(
  workspaceId: string,
  operationId: string,
  options?: InternalApiClientOptions
) {
  const query = new URLSearchParams({ operationId });
  return getInternalApiClient(options).json<ContactCreateOperationResult>(
    `${contactOperationPath(workspaceId)}?${query}`,
    { cache: 'no-store' }
  );
}

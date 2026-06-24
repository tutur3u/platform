import type { WorkspaceDocument } from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type WorkspaceDocumentSummary = Pick<
  WorkspaceDocument,
  'content' | 'created_at' | 'id' | 'is_public' | 'name'
>;

export type WorkspaceDocumentDetail = WorkspaceDocumentSummary;

export type ListWorkspaceDocumentsParams = {
  limit?: number;
  offset?: number;
  search?: string;
};

export type ListWorkspaceDocumentsResponse = {
  data: WorkspaceDocumentSummary[];
  pagination: {
    filteredTotal: number;
    limit: number;
    offset: number;
  };
};

export type CreateWorkspaceDocumentPayload = {
  content?: WorkspaceDocument['content'];
  is_public?: boolean;
  name: string;
};

export type CreateWorkspaceDocumentResponse = {
  id: string;
  message: string;
};

export type GetWorkspaceDocumentResponse = {
  data: WorkspaceDocumentDetail;
};

export type DeleteWorkspaceDocumentResponse = {
  message: string;
};

function workspaceDocumentsPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/documents`;
}

function workspaceDocumentPath(workspaceId: string, documentId: string) {
  return `${workspaceDocumentsPath(workspaceId)}/${encodePathSegment(documentId)}`;
}

export function listWorkspaceDocuments(
  workspaceId: string,
  params: ListWorkspaceDocumentsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const search = params.search?.trim();

  return client.json<ListWorkspaceDocumentsResponse>(
    workspaceDocumentsPath(workspaceId),
    {
      cache: 'no-store',
      query: {
        limit: params.limit,
        offset: params.offset,
        search: search || undefined,
      },
    }
  );
}

export async function listAllWorkspaceDocuments(
  workspaceId: string,
  params: Pick<ListWorkspaceDocumentsParams, 'search'> = {},
  options?: InternalApiClientOptions
): Promise<ListWorkspaceDocumentsResponse> {
  const pageSize = 100;
  const documents: WorkspaceDocumentSummary[] = [];
  let offset = 0;
  let filteredTotal = 0;

  do {
    const page = await listWorkspaceDocuments(
      workspaceId,
      { ...params, limit: pageSize, offset },
      options
    );

    documents.push(...page.data);
    filteredTotal = page.pagination.filteredTotal;
    offset += page.pagination.limit;

    if (page.data.length === 0) {
      break;
    }
  } while (documents.length < filteredTotal);

  return {
    data: documents,
    pagination: {
      filteredTotal,
      limit: documents.length,
      offset: 0,
    },
  };
}

export function createWorkspaceDocument(
  workspaceId: string,
  payload: CreateWorkspaceDocumentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<CreateWorkspaceDocumentResponse>(
    workspaceDocumentsPath(workspaceId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export function getWorkspaceDocument(
  workspaceId: string,
  documentId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<GetWorkspaceDocumentResponse>(
    workspaceDocumentPath(workspaceId, documentId),
    {
      cache: 'no-store',
    }
  );
}

export function deleteWorkspaceDocument(
  workspaceId: string,
  documentId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<DeleteWorkspaceDocumentResponse>(
    workspaceDocumentPath(workspaceId, documentId),
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

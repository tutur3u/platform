import type {
  CanonicalExternalProject,
  ExternalProjectAsset,
  ExternalProjectBlock,
  ExternalProjectBulkUpdatePayload,
  ExternalProjectCollection,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  ExternalProjectImportReport,
  ExternalProjectStudioData,
  ExternalProjectSummary,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type CanonicalExternalProjectUpsertPayload = {
  adapter: CanonicalExternalProject['adapter'];
  allowed_collections: CanonicalExternalProject['allowed_collections'];
  allowed_features: CanonicalExternalProject['allowed_features'];
  delivery_profile: Json;
  display_name: string;
  id: string;
  is_active: boolean;
  metadata: Json;
};

type WorkspaceExternalProjectCollectionPayload = {
  collection_type: string;
  config: Json;
  description?: string | null;
  slug: string;
  title: string;
};

type WorkspaceExternalProjectEntryPayload = {
  collection_id: string;
  metadata: Json;
  profile_data: Json;
  scheduled_for?: string | null;
  slug: string;
  status: ExternalProjectEntry['status'];
  subtitle?: string | null;
  summary?: string | null;
  title: string;
};

type WorkspaceExternalProjectBlockPayload = {
  block_type: string;
  content: Json;
  entry_id: string;
  sort_order?: number;
  title?: string | null;
};

type WorkspaceExternalProjectAssetPayload = {
  alt_text?: string | null;
  asset_type: string;
  block_id?: string | null;
  entry_id?: string | null;
  metadata: Json;
  sort_order?: number;
  source_url?: string | null;
  storage_path?: string | null;
};

type ExternalProjectUploadUrlResponse = {
  signedUrl?: string;
  token?: string;
  path?: string;
  fullPath?: string | null;
};

type ExternalProjectUploadUrlPayload = {
  signedUrl: string;
  token: string;
  path: string;
  fullPath: string | null;
};

function parseExternalProjectUploadPayload(
  payload: ExternalProjectUploadUrlResponse
) {
  if (!payload.signedUrl || !payload.token || !payload.path) {
    throw new Error('Missing upload URL payload');
  }

  return {
    signedUrl: payload.signedUrl,
    token: payload.token,
    path: payload.path,
    fullPath: payload.fullPath ?? null,
  } satisfies ExternalProjectUploadUrlPayload;
}

async function uploadExternalProjectFileWithSignedUrl(
  file: File,
  uploadUrlResult: ExternalProjectUploadUrlPayload,
  fetchImpl: typeof fetch
) {
  let uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${uploadUrlResult.token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${uploadUrlResult.token}`,
      },
      body: file,
    });
  }

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text().catch(() => '');
    throw new Error(
      `Failed to upload file (${uploadResponse.status})${message ? `: ${message}` : ''}`
    );
  }

  return {
    fullPath: uploadUrlResult.fullPath,
    path: uploadUrlResult.path,
  };
}

export async function listCanonicalExternalProjects(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CanonicalExternalProject[]>(
    '/api/v1/admin/external-projects',
    {
      cache: 'no-store',
    }
  );
}

export async function createCanonicalExternalProject(
  payload: CanonicalExternalProjectUpsertPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CanonicalExternalProject>(
    '/api/v1/admin/external-projects',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateCanonicalExternalProject(
  canonicalId: string,
  payload: Partial<CanonicalExternalProjectUpsertPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CanonicalExternalProject>(
    `/api/v1/admin/external-projects/${encodePathSegment(canonicalId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function updateWorkspaceExternalProjectBinding(
  workspaceId: string,
  canonicalId: string | null,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceExternalProjectBinding>(
    `/api/v1/admin/external-project-bindings/${encodePathSegment(workspaceId)}`,
    {
      body: JSON.stringify({ canonicalId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function getWorkspaceExternalProjectStudio(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<
    {
      binding: WorkspaceExternalProjectBinding;
    } & ExternalProjectStudioData
  >(`/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects`, {
    cache: 'no-store',
  });
}

export async function getWorkspaceExternalProjectSummary(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectSummary>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/summary`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceExternalProjectCollection(
  workspaceId: string,
  collectionId: string,
  payload: Partial<WorkspaceExternalProjectCollectionPayload> & {
    is_enabled?: boolean;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectCollection>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/collections/${encodePathSegment(collectionId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function createWorkspaceExternalProjectBlock(
  workspaceId: string,
  payload: WorkspaceExternalProjectBlockPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectBlock>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/blocks`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceExternalProjectBlock(
  workspaceId: string,
  blockId: string,
  payload: Partial<WorkspaceExternalProjectBlockPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectBlock>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/blocks/${encodePathSegment(blockId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function createWorkspaceExternalProjectAsset(
  workspaceId: string,
  payload: WorkspaceExternalProjectAssetPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectAsset>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/assets`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceExternalProjectAsset(
  workspaceId: string,
  assetId: string,
  payload: Partial<WorkspaceExternalProjectAssetPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectAsset>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/assets/${encodePathSegment(assetId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function createWorkspaceExternalProjectAssetUploadUrl(
  workspaceId: string,
  payload: {
    collectionType: string;
    entrySlug: string;
    filename: string;
    upsert?: boolean;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.json<ExternalProjectUploadUrlResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/assets/upload-url`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  return parseExternalProjectUploadPayload(response);
}

export async function uploadWorkspaceExternalProjectAssetFile(
  workspaceId: string,
  file: File,
  payload: {
    collectionType: string;
    entrySlug: string;
    upsert?: boolean;
  },
  options?: InternalApiClientOptions
) {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const uploadUrl = await createWorkspaceExternalProjectAssetUploadUrl(
    workspaceId,
    {
      ...payload,
      filename: file.name,
    },
    options
  );

  return uploadExternalProjectFileWithSignedUrl(file, uploadUrl, fetchImpl);
}

export async function listWorkspaceExternalProjectCollections(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectCollection[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/collections`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceExternalProjectCollection(
  workspaceId: string,
  payload: WorkspaceExternalProjectCollectionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectCollection>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/collections`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function listWorkspaceExternalProjectEntries(
  workspaceId: string,
  query?: {
    collectionId?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();
  if (query?.collectionId) {
    searchParams.set('collectionId', query.collectionId);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  return client.json<ExternalProjectEntry[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries${suffix}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceExternalProjectEntry(
  workspaceId: string,
  payload: WorkspaceExternalProjectEntryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectEntry>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceExternalProjectEntry(
  workspaceId: string,
  entryId: string,
  payload: Partial<WorkspaceExternalProjectEntryPayload> & {
    scheduled_for?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectEntry>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries/${encodePathSegment(entryId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function duplicateWorkspaceExternalProjectEntry(
  workspaceId: string,
  entryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectEntry>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries/${encodePathSegment(entryId)}/duplicate`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function bulkUpdateWorkspaceExternalProjectEntries(
  workspaceId: string,
  payload: ExternalProjectBulkUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectEntry[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries/bulk`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function importWorkspaceExternalProjectContent(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectImportReport>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/import`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function publishWorkspaceExternalProjectEntry(
  workspaceId: string,
  entryId: string,
  eventKind: 'publish' | 'preview' | 'unpublish',
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectEntry>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries/${encodePathSegment(entryId)}/publish`,
    {
      body: JSON.stringify({ eventKind }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function getWorkspaceExternalProjectDelivery(
  workspaceId: string,
  preview = false,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const previewQuery = preview ? '?preview=true' : '';
  return client.json<ExternalProjectDeliveryPayload>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/delivery${previewQuery}`,
    {
      cache: 'no-store',
    }
  );
}

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
  ExternalProjectWorkspaceBindingSummary,
  Json,
  WorkspaceExternalProjectBinding,
  WorkspaceExternalProjectBindingAudit,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  resolveInternalApiUrl,
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
  archivePath?: string;
  headers?: Record<string, string>;
  proxyUploadUrl?: string;
  signedUrl?: string;
  token?: string;
  path?: string;
  fullPath?: string | null;
};

type ExternalProjectUploadUrlPayload = {
  archivePath?: string;
  headers?: Record<string, string>;
  proxyUploadUrl?: string;
  signedUrl: string;
  token?: string;
  path: string;
  fullPath: string | null;
};

export type WorkspaceExternalProjectWebglPackageArtifact = {
  archivePath: string;
  assetUrls: Record<string, string>;
  entryRelativePath: string;
  entryUrl: string;
  files: Array<{
    contentType: string | null;
    relativePath: string;
    size: number | null;
  }>;
  kind: 'webgl-package';
  provider: 'supabase' | 'r2';
  rootPath: string;
  version: 1;
};

export type WorkspaceExternalProjectWebglPackageFinalizeResponse = {
  artifact: WorkspaceExternalProjectWebglPackageArtifact;
  asset: ExternalProjectAsset;
  extract: {
    files: number;
    folders: number;
    message: string;
  };
};

function parseExternalProjectUploadPayload(
  payload: ExternalProjectUploadUrlResponse
) {
  if (!payload.signedUrl || !payload.path) {
    throw new Error('Missing upload URL payload');
  }

  return {
    archivePath: payload.archivePath,
    headers: payload.headers,
    proxyUploadUrl: payload.proxyUploadUrl,
    signedUrl: payload.signedUrl,
    token: payload.token,
    path: payload.path,
    fullPath: payload.fullPath ?? null,
  } satisfies ExternalProjectUploadUrlPayload;
}

async function uploadExternalProjectFileWithSignedUrl(
  file: File,
  uploadUrlResult: ExternalProjectUploadUrlPayload,
  fetchImpl: typeof fetch,
  baseUrl?: string
) {
  const uploadUrl = uploadUrlResult.proxyUploadUrl
    ? resolveInternalApiUrl(uploadUrlResult.proxyUploadUrl, baseUrl)
    : uploadUrlResult.signedUrl;
  const isProxyUpload = Boolean(uploadUrlResult.proxyUploadUrl);
  const headers: Record<string, string> = {
    ...(isProxyUpload ? {} : (uploadUrlResult.headers ?? {})),
  };

  if (!isProxyUpload && uploadUrlResult.token) {
    headers.Authorization = `Bearer ${uploadUrlResult.token}`;
  }

  if (!headers['Content-Type']) {
    headers['Content-Type'] = file.type || 'application/octet-stream';
  }

  let uploadResponse = await fetchImpl(uploadUrl, {
    method: 'PUT',
    cache: 'no-store',
    headers,
    body: file,
  });

  if (!uploadResponse.ok && !isProxyUpload) {
    const fallbackHeaders = { ...headers };
    delete fallbackHeaders['Content-Type'];

    uploadResponse = await fetchImpl(uploadUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers: fallbackHeaders,
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
    archivePath: uploadUrlResult.archivePath ?? uploadUrlResult.path,
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

export async function listExternalProjectWorkspaceBindings(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ExternalProjectWorkspaceBindingSummary[]>(
    '/api/v1/admin/external-project-bindings',
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceExternalProjectBindingAudits(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceExternalProjectBindingAudit[]>(
    '/api/v1/admin/external-project-audits',
    {
      cache: 'no-store',
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

export async function deleteWorkspaceExternalProjectCollection(
  workspaceId: string,
  collectionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/collections/${encodePathSegment(collectionId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
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

export async function deleteWorkspaceExternalProjectAsset(
  workspaceId: string,
  assetId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/assets/${encodePathSegment(assetId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
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

export async function createWorkspaceExternalProjectWebglPackageUploadUrl(
  workspaceId: string,
  payload: {
    contentType?: string;
    entryId: string;
    filename: string;
    size?: number;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.json<ExternalProjectUploadUrlResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/webgl-packages/upload-url`,
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

export async function finalizeWorkspaceExternalProjectWebglPackage(
  workspaceId: string,
  payload: {
    archivePath: string;
    contentType?: string;
    entryId: string;
    originalFilename?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceExternalProjectWebglPackageFinalizeResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/webgl-packages/finalize`,
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

export async function uploadWorkspaceExternalProjectWebglPackageFile(
  workspaceId: string,
  file: File,
  payload: {
    entryId: string;
  },
  options?: InternalApiClientOptions
) {
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const uploadUrl = await createWorkspaceExternalProjectWebglPackageUploadUrl(
    workspaceId,
    {
      contentType: file.type || 'application/zip',
      entryId: payload.entryId,
      filename: file.name,
      size: file.size,
    },
    options
  );
  const upload = await uploadExternalProjectFileWithSignedUrl(
    file,
    uploadUrl,
    fetchImpl,
    options?.baseUrl
  );

  return finalizeWorkspaceExternalProjectWebglPackage(
    workspaceId,
    {
      archivePath: upload.archivePath,
      contentType: file.type || 'application/zip',
      entryId: payload.entryId,
      originalFilename: file.name,
    },
    options
  );
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

export async function deleteWorkspaceExternalProjectEntry(
  workspaceId: string,
  entryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/entries/${encodePathSegment(entryId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
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

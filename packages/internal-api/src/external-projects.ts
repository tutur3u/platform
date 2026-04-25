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
  getConfiguredInternalApiBaseUrl,
  getInternalApiClient,
  type InternalApiClientOptions,
  resolveInternalApiUrl,
} from './client';
import {
  createWorkspaceStorageUploadUrl,
  uploadWorkspaceStorageFile,
  type WorkspaceStorageUploadProgress,
} from './storage';

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

type ExternalProjectUploadProgressHandler = (
  progress: WorkspaceStorageUploadProgress
) => void;

type ExternalProjectUploadOptions = InternalApiClientOptions & {
  onUploadProgress?: ExternalProjectUploadProgressHandler;
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
  options?: {
    baseUrl?: string;
    onUploadProgress?: ExternalProjectUploadProgressHandler;
  }
) {
  const uploadUrl = uploadUrlResult.proxyUploadUrl
    ? resolveInternalApiUrl(
        uploadUrlResult.proxyUploadUrl,
        options?.baseUrl ?? getConfiguredInternalApiBaseUrl()
      )
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

  if (options?.onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
    try {
      await uploadExternalProjectFileWithXhr(
        file,
        uploadUrl,
        headers,
        options.onUploadProgress,
        isProxyUpload
      );
    } catch (error) {
      if (isProxyUpload) {
        throw error;
      }

      const fallbackHeaders = { ...headers };
      delete fallbackHeaders['Content-Type'];

      await uploadExternalProjectFileWithXhr(
        file,
        uploadUrl,
        fallbackHeaders,
        options.onUploadProgress,
        false
      ).catch(() => {
        throw error;
      });
    }

    return {
      archivePath: uploadUrlResult.archivePath ?? uploadUrlResult.path,
      fullPath: uploadUrlResult.fullPath,
      path: uploadUrlResult.path,
    };
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

  options?.onUploadProgress?.({
    loaded: file.size,
    percent: 100,
    total: file.size,
  });

  return {
    archivePath: uploadUrlResult.archivePath ?? uploadUrlResult.path,
    fullPath: uploadUrlResult.fullPath,
    path: uploadUrlResult.path,
  };
}

function uploadExternalProjectFileWithXhr(
  file: File,
  uploadUrl: string,
  headers: Record<string, string>,
  onProgress: ExternalProjectUploadProgressHandler,
  withCredentials: boolean
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = withCredentials;

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size || null;
      const loaded = event.loaded;
      const percent =
        total && total > 0
          ? Math.min(99, Math.round((loaded / total) * 100))
          : 0;

      onProgress({
        loaded,
        percent,
        total,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress({
          loaded: file.size,
          percent: 100,
          total: file.size,
        });
        resolve();
        return;
      }

      reject(
        new Error(
          `Failed to upload file (${xhr.status})${xhr.responseText ? `: ${xhr.responseText}` : ''}`
        )
      );
    };

    xhr.onerror = () => {
      reject(new Error('Failed to upload file'));
    };
    xhr.onabort = () => {
      reject(new Error('Upload aborted'));
    };

    xhr.open('PUT', uploadUrl);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(file);
  });
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
    adapter?: string | null;
    collectionType: string;
    entrySlug: string;
    filename: string;
    size?: number;
    upsert?: boolean;
  },
  options?: InternalApiClientOptions
) {
  return createWorkspaceStorageUploadUrl(
    workspaceId,
    payload.filename,
    {
      path: buildExternalProjectAssetStoragePath(payload),
      size: payload.size,
      upsert: payload.upsert,
    },
    options
  );
}

function normalizeExternalProjectPathPart(value: string, label: string) {
  const segments = value
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error(`Invalid ${label}`);
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..' || segment.includes('..')) {
      throw new Error(`Invalid ${label}`);
    }
  }

  return segments.join('/');
}

function buildExternalProjectAssetStoragePath(payload: {
  adapter?: string | null;
  collectionType: string;
  entrySlug: string;
}) {
  const adapter = normalizeExternalProjectPathPart(
    payload.adapter || 'shared',
    'external project adapter'
  );
  const collectionType = normalizeExternalProjectPathPart(
    payload.collectionType,
    'collection type'
  );
  const entrySlug = normalizeExternalProjectPathPart(
    payload.entrySlug,
    'entry slug'
  );

  return `external-projects/${adapter}/${collectionType}/${entrySlug}`;
}

export async function uploadWorkspaceExternalProjectAssetFile(
  workspaceId: string,
  file: File,
  payload: {
    adapter?: string | null;
    collectionType: string;
    entrySlug: string;
    upsert?: boolean;
  },
  options?: ExternalProjectUploadOptions
) {
  return uploadWorkspaceStorageFile(
    workspaceId,
    file,
    {
      onUploadProgress: options?.onUploadProgress,
      path: buildExternalProjectAssetStoragePath(payload),
      upsert: payload.upsert,
    },
    options
  );
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
  options?: ExternalProjectUploadOptions
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
    {
      baseUrl: options?.baseUrl,
      onUploadProgress: options?.onUploadProgress,
    }
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

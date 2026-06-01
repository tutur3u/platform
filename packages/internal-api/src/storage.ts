import type {
  ImageTransformOptions,
  WorkspaceStorageFile,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface WorkspaceUploadUrlResponse {
  signedUrl?: string;
  token?: string;
  headers?: Record<string, string>;
  path?: string;
  fullPath?: string;
  filename?: string;
  contentType?: string;
  provider?: 'r2' | 'supabase';
}

interface WorkspaceStorageShareResponse {
  signedUrl?: string;
}

interface WorkspaceStorageFinalizeUploadResponse {
  autoExtract?: {
    status?: string;
    message?: string;
    archivePath?: string;
    destinationPrefix?: string;
    files?: number;
    folders?: number;
  };
}

export interface WorkspaceStorageAutoExtractResult {
  status?: string;
  message?: string;
  archivePath?: string;
  destinationPrefix?: string;
  files?: number;
  folders?: number;
}

export interface WorkspaceStorageFinalizeStatus {
  success: boolean;
  error?: string;
}

export interface WorkspaceStorageUploadResult {
  path: string;
  fullPath: string | null;
  autoExtract?: WorkspaceStorageAutoExtractResult;
  finalize?: WorkspaceStorageFinalizeStatus;
}

interface WorkspaceStorageMigrationResponse {
  data: {
    sourceProvider: 'supabase' | 'r2';
    targetProvider: 'supabase' | 'r2';
    filesCopied: number;
    foldersPrepared: number;
    skipped: number;
  };
}

export type WorkspaceStorageListItem = WorkspaceStorageFile;

export interface WorkspaceStorageListResponse {
  data: WorkspaceStorageListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface WorkspaceStorageMetricFile {
  name: string;
  size: number;
  createdAt?: string | null;
}

export interface WorkspaceStorageAnalyticsResponse {
  data: {
    totalSize: number;
    fileCount: number;
    storageLimit: number;
    usagePercentage: number;
    largestFile: WorkspaceStorageMetricFile | null;
    smallestFile: WorkspaceStorageMetricFile | null;
  };
}

export interface WorkspaceStorageExportFile {
  path: string;
  relativePath: string;
  url: string;
  size?: number;
  contentType?: string | null;
}

export interface WorkspaceStorageExportLinksResponse {
  folderName: string;
  folderPath: string;
  generatedAt: string;
  indexFile: WorkspaceStorageExportFile | null;
  files: WorkspaceStorageExportFile[];
  loaderManifest: {
    entryUrl: string | null;
    assetUrls: Record<string, string>;
  };
  mode: 'rotating';
}

interface WorkspaceStorageFolderResponse {
  message: string;
  data?: {
    path: string;
    fullPath: string;
  };
}

interface WorkspaceStorageRenameResponse {
  message: string;
  data?: {
    previousName: string;
    name: string;
  };
}

interface WorkspaceStorageDeleteResponse {
  success?: boolean;
  message?: string;
  data?: {
    deleted?: number;
    paths?: string[];
  };
}

export interface SignedUploadPayload {
  signedUrl: string;
  token?: string;
  headers?: Record<string, string>;
  path: string;
  fullPath: string | null;
  filename?: string;
  contentType?: string;
  provider?: 'r2' | 'supabase';
}

interface WorkspaceUserGroupStorageResponse {
  data: WorkspaceStorageFile[];
}

export interface WorkspaceStorageUploadProgress {
  loaded: number;
  percent: number;
  total: number | null;
}

type UploadProgressHandler = (progress: WorkspaceStorageUploadProgress) => void;

function uploadFileWithXhr(
  file: File,
  uploadUrlResult: SignedUploadPayload,
  headers: Record<string, string>,
  onProgress: UploadProgressHandler
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

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

    xhr.open('PUT', uploadUrlResult.signedUrl);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(file);
  });
}

export async function uploadFileWithSignedUrl(
  file: File,
  uploadUrlResult: SignedUploadPayload,
  fetchImpl: typeof fetch,
  onProgress?: UploadProgressHandler,
  onUploaded?: (result: {
    path: string;
    fullPath: string | null;
  }) => Promise<Record<string, unknown> | undefined>
): Promise<
  Record<string, unknown> & { path: string; fullPath: string | null }
> {
  const headers: Record<string, string> = {
    ...(uploadUrlResult.headers ?? {}),
  };

  if (!headers['Content-Type']) {
    headers['Content-Type'] =
      uploadUrlResult.contentType || file.type || 'application/octet-stream';
  }

  if (uploadUrlResult.token) {
    headers.Authorization = `Bearer ${uploadUrlResult.token}`;
  }

  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    try {
      await uploadFileWithXhr(file, uploadUrlResult, headers, onProgress);
    } catch (error) {
      const fallbackHeaders = { ...headers };
      delete fallbackHeaders['Content-Type'];

      await uploadFileWithXhr(
        file,
        uploadUrlResult,
        fallbackHeaders,
        onProgress
      ).catch(() => {
        throw error;
      });
    }
  } else {
    let uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
      method: 'PUT',
      cache: 'no-store',
      headers,
      body: file,
    });

    if (!uploadResponse.ok) {
      const fallbackHeaders = { ...headers };
      delete fallbackHeaders['Content-Type'];

      uploadResponse = await fetchImpl(uploadUrlResult.signedUrl, {
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

    onProgress?.({
      loaded: file.size,
      percent: 100,
      total: file.size,
    });
  }

  const result = {
    path: uploadUrlResult.path,
    fullPath: uploadUrlResult.fullPath,
  };

  const postUploadData = (await onUploaded?.(result)) ?? {};
  return {
    ...result,
    ...postUploadData,
  };
}

function parseSignedUploadPayload(payload: WorkspaceUploadUrlResponse) {
  if (!payload.signedUrl || !payload.path) {
    throw new Error('Missing upload URL payload');
  }

  const result: SignedUploadPayload = {
    signedUrl: payload.signedUrl,
    token: payload.token,
    headers: payload.headers,
    path: payload.path,
    fullPath: payload.fullPath ?? null,
  };

  if (payload.filename) {
    result.filename = payload.filename;
  }
  if (payload.contentType) {
    result.contentType = payload.contentType;
  }
  if (payload.provider) {
    result.provider = payload.provider;
  }

  return result;
}

export async function uploadWorkspaceStorageFile(
  workspaceId: string,
  file: File,
  options?: {
    onUploadProgress?: UploadProgressHandler;
    path?: string;
    upsert?: boolean;
  },
  clientOptions?: InternalApiClientOptions
): Promise<WorkspaceStorageUploadResult> {
  const fetchImpl = clientOptions?.fetch ?? globalThis.fetch;
  const { onUploadProgress, ...uploadOptions } = options ?? {};
  const uploadUrlResult = await createWorkspaceStorageUploadUrl(
    workspaceId,
    file.name,
    {
      ...uploadOptions,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    },
    clientOptions
  );

  return uploadFileWithSignedUrl(
    file,
    uploadUrlResult,
    fetchImpl,
    onUploadProgress,
    async (result) => {
      try {
        const finalized = await finalizeWorkspaceStorageUpload(
          workspaceId,
          {
            path: result.path,
            contentType: file.type || 'application/octet-stream',
            originalFilename: file.name,
          },
          clientOptions
        );

        return {
          autoExtract: finalized.autoExtract,
          finalize: {
            success: true,
          },
        };
      } catch (error) {
        return {
          finalize: {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to finalize upload',
          },
        };
      }
    }
  );
}

export async function uploadWorkspaceUserGroupStorageFile(
  workspaceId: string,
  groupId: string,
  file: File,
  options?: {
    onUploadProgress?: UploadProgressHandler;
    upsert?: boolean;
  },
  clientOptions?: InternalApiClientOptions
): Promise<WorkspaceStorageUploadResult> {
  const fetchImpl = clientOptions?.fetch ?? globalThis.fetch;
  const { onUploadProgress, upsert } = options ?? {};
  const uploadUrlResult = await createWorkspaceUserGroupStorageUploadUrl(
    workspaceId,
    groupId,
    file.name,
    {
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      upsert,
    },
    clientOptions
  );

  return uploadFileWithSignedUrl(
    file,
    uploadUrlResult,
    fetchImpl,
    onUploadProgress,
    async (result) => {
      const finalized = await finalizeWorkspaceStorageUpload(
        workspaceId,
        {
          path: result.path,
          contentType: file.type || 'application/octet-stream',
          originalFilename: file.name,
        },
        clientOptions
      );

      return {
        autoExtract: finalized.autoExtract,
        finalize: {
          success: true,
        },
      };
    }
  );
}

export async function uploadWorkspaceTaskFile(
  workspaceId: string,
  file: File,
  options?: {
    onUploadProgress?: UploadProgressHandler;
    taskId?: string;
  },
  clientOptions?: InternalApiClientOptions
) {
  const fetchImpl = clientOptions?.fetch ?? globalThis.fetch;
  const { onUploadProgress, ...uploadOptions } = options ?? {};
  const uploadUrlResult = await createWorkspaceTaskUploadUrl(
    workspaceId,
    file.name,
    uploadOptions,
    clientOptions
  );

  return uploadFileWithSignedUrl(
    file,
    uploadUrlResult,
    fetchImpl,
    onUploadProgress
  );
}

async function finalizeWorkspaceStorageUpload(
  workspaceId: string,
  payload: {
    path: string;
    contentType?: string;
    originalFilename?: string;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<WorkspaceStorageFinalizeUploadResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/finalize-upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceStorageUploadUrl(
  workspaceId: string,
  filename: string,
  options?: {
    path?: string;
    upsert?: boolean;
    size?: number;
    contentType?: string;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const payload = await client.json<WorkspaceUploadUrlResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/upload-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        path: options?.path,
        upsert: options?.upsert,
        size: options?.size,
        contentType: options?.contentType,
      }),
      cache: 'no-store',
    }
  );

  return parseSignedUploadPayload(payload);
}

export async function createWorkspaceUserGroupStorageUploadUrl(
  workspaceId: string,
  groupId: string,
  filename: string,
  options?: {
    contentType?: string;
    upsert?: boolean;
    size?: number;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const payload = await client.json<WorkspaceUploadUrlResponse>(
    `/api/v1/workspaces/${encodePathSegment(
      workspaceId
    )}/user-groups/${encodePathSegment(groupId)}/storage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        contentType: options?.contentType,
        upsert: options?.upsert,
        size: options?.size,
      }),
      cache: 'no-store',
    }
  );

  return parseSignedUploadPayload(payload);
}

export async function createWorkspaceTaskUploadUrl(
  workspaceId: string,
  filename: string,
  options?: {
    taskId?: string;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const payload = await client.json<WorkspaceUploadUrlResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/upload-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        taskId: options?.taskId,
      }),
      cache: 'no-store',
    }
  );

  return parseSignedUploadPayload(payload);
}

export async function createWorkspaceStorageSignedUrl(
  workspaceId: string,
  path: string,
  expiresIn = 60 * 60 * 24,
  transform?: ImageTransformOptions,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<WorkspaceStorageShareResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/share`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, expiresIn, transform }),
      cache: 'no-store',
    }
  );

  if (!payload.signedUrl) {
    throw new Error('Missing signed URL');
  }

  return payload.signedUrl;
}

export async function migrateWorkspaceStorage(
  workspaceId: string,
  payload: {
    sourceProvider: 'supabase' | 'r2';
    targetProvider: 'supabase' | 'r2';
    overwrite?: boolean;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const response = await client.json<WorkspaceStorageMigrationResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/migrate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );

  return response.data;
}

export async function listWorkspaceStorageObjects(
  workspaceId: string,
  query?: {
    path?: string;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'created_at' | 'updated_at' | 'size';
    sortOrder?: 'asc' | 'desc';
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageListResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/list`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceUserGroupStorageFiles(
  workspaceId: string,
  groupId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.json<WorkspaceUserGroupStorageResponse>(
    `/api/v1/workspaces/${encodePathSegment(
      workspaceId
    )}/user-groups/${encodePathSegment(groupId)}/storage`,
    {
      cache: 'no-store',
    }
  );

  return response.data;
}

export async function getWorkspaceStorageAnalytics(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageAnalyticsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/analytics`,
    {
      cache: 'no-store',
    }
  );
}

export async function exportWorkspaceStorageLinks(
  workspaceId: string,
  payload: {
    path: string;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<WorkspaceStorageExportLinksResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/export-links`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceStorageObject(
  workspaceId: string,
  path: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageDeleteResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/object`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceUserGroupStorageFile(
  workspaceId: string,
  groupId: string,
  filename: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageDeleteResponse>(
    `/api/v1/workspaces/${encodePathSegment(
      workspaceId
    )}/user-groups/${encodePathSegment(groupId)}/storage`,
    {
      method: 'DELETE',
      query: { filename },
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceStorageObjects(
  workspaceId: string,
  paths: string[],
  options?: InternalApiClientOptions
) {
  await Promise.all(
    paths.map((path) =>
      deleteWorkspaceStorageObject(workspaceId, path, options)
    )
  );

  return {
    message: `Successfully deleted ${paths.length} file(s)`,
    data: {
      deleted: paths.length,
      paths,
    },
  } satisfies WorkspaceStorageDeleteResponse;
}

export async function createWorkspaceStorageFolder(
  workspaceId: string,
  payload: { path?: string; name: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageFolderResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/folders`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function renameWorkspaceStorageObject(
  workspaceId: string,
  payload: {
    path?: string;
    currentName: string;
    newName: string;
    isFolder?: boolean;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageRenameResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/rename`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceStorageFolder(
  workspaceId: string,
  payload: { path?: string; name: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageDeleteResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/storage/folders`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

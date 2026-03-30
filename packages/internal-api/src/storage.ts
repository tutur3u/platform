import type { ImageTransformOptions } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

interface WorkspaceStorageUploadUrlResponse {
  signedUrl?: string;
  token?: string;
  path?: string;
  fullPath?: string;
}

interface WorkspaceStorageShareResponse {
  signedUrl?: string;
}

export interface WorkspaceStorageListItem {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface WorkspaceStorageListResponse {
  data: WorkspaceStorageListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
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

export async function uploadWorkspaceStorageFile(
  workspaceId: string,
  file: File,
  options?: {
    path?: string;
    upsert?: boolean;
  },
  clientOptions?: InternalApiClientOptions
) {
  const fetchImpl = clientOptions?.fetch ?? globalThis.fetch;

  const uploadUrlResult = await createWorkspaceStorageUploadUrl(
    workspaceId,
    file.name,
    options,
    clientOptions
  );

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
    path: uploadUrlResult.path,
    fullPath: uploadUrlResult.fullPath,
  };
}

export async function createWorkspaceStorageUploadUrl(
  workspaceId: string,
  filename: string,
  options?: {
    path?: string;
    upsert?: boolean;
  },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const payload = await client.json<WorkspaceStorageUploadUrlResponse>(
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
      }),
      cache: 'no-store',
    }
  );

  if (!payload.signedUrl || !payload.token || !payload.path) {
    throw new Error('Missing upload URL payload');
  }

  return {
    signedUrl: payload.signedUrl,
    token: payload.token,
    path: payload.path,
    fullPath: payload.fullPath ?? null,
  };
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

export async function deleteWorkspaceStorageObjects(
  workspaceId: string,
  paths: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceStorageDeleteResponse>(
    `/api/v1/storage/delete?wsId=${encodePathSegment(workspaceId)}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths }),
      cache: 'no-store',
    }
  );
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

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

export async function uploadWorkspaceStorageFile(
  workspaceId: string,
  file: File,
  options?: {
    path?: string;
    upsert?: boolean;
  },
  clientOptions?: InternalApiClientOptions
) {
  const uploadUrlResult = await createWorkspaceStorageUploadUrl(
    workspaceId,
    file.name,
    options,
    clientOptions
  );

  let uploadResponse = await fetch(uploadUrlResult.signedUrl, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${uploadUrlResult.token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok && file.type) {
    uploadResponse = await fetch(uploadUrlResult.signedUrl, {
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
      body: JSON.stringify({ path, expiresIn }),
      cache: 'no-store',
    }
  );

  if (!payload.signedUrl) {
    throw new Error('Missing signed URL');
  }

  return payload.signedUrl;
}

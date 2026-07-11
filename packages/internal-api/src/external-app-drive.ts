import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type ExternalAppDriveProvider = 'r2' | 'supabase';

export type ExternalAppDriveUploadRequest = {
  attachmentId: string;
  contentType: string;
  conversationId: string;
  filename: string;
  size: number;
};

export type ExternalAppDriveUploadPayload = {
  contentType?: string;
  expiresIn: number;
  filename: string;
  fullPath: string;
  headers?: Record<string, string>;
  path: string;
  provider: ExternalAppDriveProvider;
  signedUrl: string;
  token?: string;
};

export type ExternalAppDriveObject = {
  contentType: string;
  fullPath: string;
  path: string;
  provider: ExternalAppDriveProvider;
  size: number;
};

export type ExternalAppDriveReadPayload = {
  expiresIn: number;
  provider: ExternalAppDriveProvider;
  signedUrl: string;
};

type ObjectRequest = {
  contentType?: string;
  path: string;
  provider?: ExternalAppDriveProvider;
  size?: number;
};

function drivePath(workspaceId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-apps/drive${suffix}`;
}

function jsonInit(method: 'DELETE' | 'POST', payload: unknown): RequestInit {
  return {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method,
  };
}

export function createExternalAppDriveUploadUrl(
  workspaceId: string,
  payload: ExternalAppDriveUploadRequest,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ExternalAppDriveUploadPayload>(
    drivePath(workspaceId, '/upload-url'),
    jsonInit('POST', payload)
  );
}

export function finalizeExternalAppDriveUpload(
  workspaceId: string,
  payload: Required<Pick<ObjectRequest, 'contentType' | 'path' | 'size'>> &
    Pick<ObjectRequest, 'provider'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ExternalAppDriveObject>(
    drivePath(workspaceId, '/finalize'),
    jsonInit('POST', payload)
  );
}

export function createExternalAppDriveReadUrl(
  workspaceId: string,
  payload: Pick<ObjectRequest, 'path' | 'provider'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ExternalAppDriveReadPayload>(
    drivePath(workspaceId, '/read-url'),
    jsonInit('POST', payload)
  );
}

export function deleteExternalAppDriveObject(
  workspaceId: string,
  payload: Pick<ObjectRequest, 'path'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    deleted: true;
    provider: ExternalAppDriveProvider;
  }>(drivePath(workspaceId), jsonInit('DELETE', payload));
}

export async function uploadExternalAppDriveFile(
  file: File,
  upload: ExternalAppDriveUploadPayload,
  options?: { fetch?: typeof fetch; onProgress?: (percent: number) => void }
) {
  const headers = new Headers(upload.headers);
  if (upload.token) headers.set('Authorization', `Bearer ${upload.token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', file.type || 'application/octet-stream');
  }

  if (options?.onProgress && typeof XMLHttpRequest !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', upload.signedUrl);
      headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : file.size;
        options.onProgress?.(
          total > 0 ? Math.min(99, Math.round((event.loaded / total) * 100)) : 0
        );
      };
      xhr.onerror = () => reject(new Error('Failed to upload attachment'));
      xhr.onabort = () => reject(new Error('Attachment upload aborted'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          options.onProgress?.(100);
          resolve();
        } else {
          reject(new Error(`Failed to upload attachment (${xhr.status})`));
        }
      };
      xhr.send(file);
    });
    return;
  }

  const response = await (options?.fetch ?? globalThis.fetch)(
    upload.signedUrl,
    {
      body: file,
      headers,
      method: 'PUT',
    }
  );
  if (!response.ok)
    throw new Error(`Failed to upload attachment (${response.status})`);
}

import type { ChatAttachmentDraft } from './chat-types';
import { encodePathSegment } from './client';

export interface ChatUploadUrlResponse {
  attachment: ChatAttachmentDraft;
  headers?: Record<string, string>;
  maxSizeBytes: number;
  signedUrl: string;
  token?: string;
}

export function chatBasePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat`;
}

export async function uploadFileWithSignedUrl(
  file: File,
  payload: ChatUploadUrlResponse,
  fetchImpl: typeof fetch
) {
  const headers: Record<string, string> = {
    ...(payload.headers ?? {}),
  };

  if (!headers['Content-Type']) {
    headers['Content-Type'] = file.type || 'application/octet-stream';
  }

  if (payload.token) {
    headers.Authorization = `Bearer ${payload.token}`;
  }

  let response = await fetchImpl(payload.signedUrl, {
    body: file,
    cache: 'no-store',
    headers,
    method: 'PUT',
  });

  if (!response.ok && headers['Content-Type']) {
    const fallbackHeaders = { ...headers };
    delete fallbackHeaders['Content-Type'];
    response = await fetchImpl(payload.signedUrl, {
      body: file,
      cache: 'no-store',
      headers: fallbackHeaders,
      method: 'PUT',
    });
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      `Failed to upload file (${response.status})${message ? `: ${message}` : ''}`
    );
  }
}

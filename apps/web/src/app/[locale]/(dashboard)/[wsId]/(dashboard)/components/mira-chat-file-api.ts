'use client';

import {
  deleteAiChatFile,
  getAiChatUploadContentType,
  uploadAiChatFile,
} from '@tuturuuu/internal-api';

export const getUploadContentType = getAiChatUploadContentType;

export async function fetchSignedReadUrlsMutationFn(
  paths: string[]
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const res = await fetch('/api/ai/chat/signed-read-url', {
    body: JSON.stringify({ paths }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch signed read URLs (HTTP ${res.status}): ${body || 'No response body'}`
    );
  }

  const jsonResponse = (await res.json().catch(() => ({}))) as {
    urls?: { path: string; signedUrl: string | null }[];
  };
  const urls = jsonResponse.urls;

  if (
    !Array.isArray(urls) ||
    !urls.every(
      (url) =>
        url && typeof url === 'object' && 'path' in url && 'signedUrl' in url
    )
  ) {
    throw new Error('Invalid response shape for signed read URLs');
  }

  const map = new Map<string, string>();

  for (const url of urls) {
    if (url.signedUrl) map.set(url.path, url.signedUrl);
  }

  return map;
}

export async function uploadChatFileMutationFn({
  wsId,
  chatId,
  file,
}: {
  wsId: string;
  chatId: string | undefined;
  file: File;
}): Promise<{ path: string | null; error: string | null }> {
  try {
    const attachment = await uploadAiChatFile({
      chatId,
      file,
      workspaceId: wsId,
    });

    return { error: null, path: attachment.path };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Upload failed',
      path: null,
    };
  }
}

export async function deleteChatFileMutationFn({
  wsId,
  path,
}: {
  wsId: string;
  path: string;
}): Promise<{ path: string | null; error: string | null }> {
  try {
    await deleteAiChatFile({ path, wsId });
    return { error: null, path };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete file',
      path: null,
    };
  }
}

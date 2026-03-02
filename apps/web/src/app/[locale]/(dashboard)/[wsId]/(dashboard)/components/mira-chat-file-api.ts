'use client';

const OFFICE_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function getUploadContentType(file: File): string {
  const mime = file.type.toLowerCase();
  if (OFFICE_MIME_TYPES.has(mime)) return 'application/octet-stream';
  return mime || 'application/octet-stream';
}

export async function fetchSignedReadUrlsMutationFn(
  paths: string[]
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const res = await fetch('/api/ai/chat/signed-read-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch signed read URLs (HTTP ${res.status}): ${body || 'No response body'}`
    );
  }

  const jsonResponse = (await res.json().catch(() => ({}))) as any;
  const urls =
    typeof jsonResponse === 'object' && jsonResponse !== null
      ? jsonResponse.urls
      : undefined;

  if (
    !Array.isArray(urls) ||
    !urls.every(
      (u: any) => u && typeof u === 'object' && 'path' in u && 'signedUrl' in u
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

export async function uploadSignedUrlPutMutationFn({
  signedUrl,
  token,
  file,
  contentType,
  forceBinaryBlob = false,
}: {
  signedUrl: string;
  token: string;
  file: File;
  contentType: string;
  forceBinaryBlob?: boolean;
}): Promise<Response> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    'Content-Type': contentType,
  };

  const shouldUseBlob =
    forceBinaryBlob || contentType === 'application/octet-stream';
  const body = shouldUseBlob ? file.slice(0, file.size, contentType) : file;

  return fetch(signedUrl, {
    method: 'PUT',
    headers,
    body,
  });
}

export async function uploadChatFileMutationFn({
  wsId,
  chatId,
  file,
  uploadViaSignedPut,
}: {
  wsId: string;
  chatId: string | undefined;
  file: File;
  uploadViaSignedPut: (
    args: Parameters<typeof uploadSignedUrlPutMutationFn>[0]
  ) => Promise<Response>;
}): Promise<{ path: string | null; error: string | null }> {
  try {
    const res = await fetch('/api/ai/chat/upload-url', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, wsId, chatId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        (body as { message?: string }).message ?? `HTTP ${res.status}`;
      console.error('[Mira Chat] Failed to get signed URL:', msg);
      return { path: null, error: msg };
    }

    const { signedUrl, token, path } = (await res.json()) as {
      signedUrl: string;
      token: string;
      path: string;
    };

    const tryUpload = async (contentType: string, forceBinaryBlob = false) =>
      uploadViaSignedPut({
        signedUrl,
        token,
        file,
        contentType,
        forceBinaryBlob,
      });

    let uploadRes = await tryUpload(getUploadContentType(file));
    let uploadErrorText = '';

    if (!uploadRes.ok) {
      uploadErrorText = await uploadRes.text().catch(() => '');

      if (/unsupported mime type/i.test(uploadErrorText)) {
        uploadErrorText = '';
        uploadRes = await tryUpload('application/octet-stream', true);
      }
    }

    if (!uploadRes.ok) {
      if (!uploadErrorText) {
        uploadErrorText = await uploadRes.text().catch(() => '');
      }

      console.error('[Mira Chat] Signed upload failed:', uploadErrorText);
      return {
        path: null,
        error: uploadErrorText || `Upload failed (${uploadRes.status})`,
      };
    }

    return { path, error: null };
  } catch (err) {
    console.error('[Mira Chat] File upload exception:', err);
    return {
      path: null,
      error: err instanceof Error ? err.message : 'Upload failed',
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
    const res = await fetch('/api/ai/chat/delete-file', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wsId, path }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message =
        (body as { message?: string }).message ??
        `Failed to delete chat file (HTTP ${res.status})`;
      return { path: null, error: message };
    }

    return { path, error: null };
  } catch (error) {
    return {
      path: null,
      error: error instanceof Error ? error.message : 'Failed to delete file',
    };
  }
}

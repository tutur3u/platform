import {
  getInternalApiClient,
  type InternalApiClientOptions,
  InternalApiError,
  withMailApiBaseUrl,
} from './client';

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

export async function getMailAttachmentText(
  protectedUrl: string,
  signal?: AbortSignal,
  options?: InternalApiClientOptions
) {
  if (
    !/^\/api\/v1\/workspaces\/[^/]+\/mail\/mailboxes\/[^/]+\/messages\/[^/]+\/attachments\/[^/?]+$/u.test(
      protectedUrl
    )
  ) {
    throw new Error('Invalid Mail attachment path');
  }
  const response = await getInternalApiClient(
    withMailApiBaseUrl(options)
  ).fetch(protectedUrl, {
    credentials: 'include',
    cache: 'no-store',
    signal,
    headers: { Range: `bytes=0-${MAX_TEXT_PREVIEW_BYTES - 1}` },
    query: { preview: '1' },
  });
  if (!response.ok)
    throw new InternalApiError('Attachment preview failed', response.status);
  if (
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('text/plain')
  ) {
    throw new Error('Attachment is not plain text');
  }
  const total =
    response.headers.get('content-range')?.match(/\/(\d+)$/u)?.[1] ??
    response.headers.get('content-length');
  if (total && Number(total) > MAX_TEXT_PREVIEW_BYTES) {
    await response.body?.cancel();
    throw new Error('Text attachment is too large to preview');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TEXT_PREVIEW_BYTES)
        throw new Error('Text attachment is too large to preview');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

/** Read an authenticated DOCX without buffering an unbounded attachment. */
export async function getMailAttachmentDocx(
  protectedUrl: string,
  signal?: AbortSignal,
  options?: InternalApiClientOptions
) {
  const limit = 10 * 1024 * 1024;
  if (
    !/^\/api\/v1\/workspaces\/[^/]+\/mail\/mailboxes\/[^/]+\/messages\/[^/]+\/attachments\/[^/?]+$/u.test(
      protectedUrl
    )
  ) {
    throw new Error('Invalid Mail attachment path');
  }
  const response = await getInternalApiClient(
    withMailApiBaseUrl(options)
  ).fetch(protectedUrl, {
    credentials: 'include',
    cache: 'no-store',
    signal,
    headers: { Range: `bytes=0-${limit - 1}` },
    query: { preview: '1' },
  });
  if (!response.ok)
    throw new InternalApiError('Attachment preview failed', response.status);
  const type = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  const total =
    response.headers.get('content-range')?.match(/\/(\d+)$/u)?.[1] ??
    response.headers.get('content-length');
  if (
    ![
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ].includes(type ?? '') ||
    (total && Number(total) > limit)
  ) {
    await response.body?.cancel();
    throw new Error('Attachment cannot be previewed as DOCX');
  }
  if (!response.body) throw new Error('Empty DOCX attachment');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new Error('DOCX attachment is too large to preview');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

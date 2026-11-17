import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  InternalApiError,
  withMailApiBaseUrl,
} from './client';
import { mailboxPath } from './mail-paths';

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export async function getMailMessageSource(
  workspaceId: string,
  mailboxId: string,
  messageId: string,
  signal?: AbortSignal,
  options?: InternalApiClientOptions
) {
  const response = await getInternalApiClient(
    withMailApiBaseUrl(options)
  ).fetch(
    mailboxPath(
      workspaceId,
      mailboxId,
      `/messages/${encodePathSegment(messageId)}/source`
    ),
    { credentials: 'include', cache: 'no-store', signal }
  );
  if (!response.ok)
    throw new InternalApiError('Message source unavailable', response.status);
  if (
    response.status !== 200 ||
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('text/plain')
  ) {
    await response.body?.cancel();
    throw new Error('Invalid message source response');
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
      if (size > MAX_SOURCE_BYTES)
        throw new Error('Message source is too large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export function getMailSourceHeaders(source: string) {
  return source.split(/\r?\n\r?\n/u, 1)[0] ?? '';
}

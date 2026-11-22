import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

/** Text previews render inline; larger files are offered as a download. */
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

export class PreviewTooLargeError extends Error {}

export function isTextTooLargeToPreview(file: StorageObject) {
  const size = file.metadata?.size;
  return typeof size === 'number' && size > TEXT_PREVIEW_MAX_BYTES;
}

export async function fetchPreviewText(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load file preview');
  const length = Number(response.headers.get('content-length'));
  if (length > TEXT_PREVIEW_MAX_BYTES) {
    await response.body?.cancel();
    throw new PreviewTooLargeError();
  }
  // Size metadata and Content-Length can both be absent, so stop reading at
  // the cap instead of buffering an unbounded body.
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (text.length > TEXT_PREVIEW_MAX_BYTES) throw new PreviewTooLargeError();
    return text;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > TEXT_PREVIEW_MAX_BYTES) {
      await reader.cancel();
      throw new PreviewTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

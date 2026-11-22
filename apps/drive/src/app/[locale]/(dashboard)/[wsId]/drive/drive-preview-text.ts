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
  const text = await response.text();
  if (text.length > TEXT_PREVIEW_MAX_BYTES) throw new PreviewTooLargeError();
  return text;
}

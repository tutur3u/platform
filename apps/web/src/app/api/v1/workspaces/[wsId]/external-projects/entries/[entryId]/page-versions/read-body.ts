import { PageVersionError } from '@/lib/external-projects/page-versions';

/** Allows envelope overhead above the separate 2 MiB stored-page limit. */
export const CMS_SAVE_REQUEST_MAX_BYTES = 2.5 * 1024 * 1024;

export async function readPageVersionBody(request: Request): Promise<unknown> {
  const tooLarge = () => new PageVersionError(413, 'Request body is too large');
  const length = request.headers.get('content-length');
  if (length !== null && Number(length) > CMS_SAVE_REQUEST_MAX_BYTES) {
    throw tooLarge();
  }
  if (!request.body) throw new SyntaxError('Missing request body');

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CMS_SAVE_REQUEST_MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best effort; preserve the request-size response.
        }
        throw tooLarge();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(chunks.join(''));
}

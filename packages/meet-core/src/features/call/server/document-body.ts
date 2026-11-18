import { MeetCallAccessError } from '../lib/call-access';

/** An 8,000-character selection plus cursor and instruction fit with escaping. */
export const DOCUMENT_BODY_LIMIT = 64 * 1024;

/**
 * Counts streamed bytes and cancels at the limit, so an oversize request is
 * never buffered whole. Only the bounded bytes are decoded and parsed.
 */
export async function readDocumentBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new MeetCallAccessError(400, 'Missing request');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(request.headers.get('content-length')) > DOCUMENT_BODY_LIMIT) {
      await reader.cancel();
      throw new MeetCallAccessError(413, 'Request is too large');
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DOCUMENT_BODY_LIMIT) {
        await reader.cancel();
        throw new MeetCallAccessError(413, 'Request is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new MeetCallAccessError(400, 'Invalid document request');
  }
}

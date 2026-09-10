import { MeetCallAccessError } from '../lib/call-access';

// Twelve 2000-code-unit turns plus a question fit even with JSON escaping.
const LIMIT = 160000;
/** Bound streamed bytes before allocating or parsing the full JSON body. */
export async function readPersonalChatBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new MeetCallAccessError(400, 'Missing message');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(request.headers.get('content-length')) > LIMIT) {
      await reader.cancel();
      throw new MeetCallAccessError(413, 'Message too large');
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) {
        await reader.cancel();
        throw new MeetCallAccessError(413, 'Message too large');
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
    throw new MeetCallAccessError(400, 'Invalid message');
  }
}

import { MeetAiError } from './access';

/** Bound actual bytes, including requests without a Content-Length header. */
export async function readMeetAudioForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new MeetAiError(400, 'Missing audio');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 500_000) {
        await reader.cancel();
        throw new MeetAiError(413, 'Audio too large');
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
    return await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    throw new MeetAiError(400, 'Invalid audio form');
  }
}

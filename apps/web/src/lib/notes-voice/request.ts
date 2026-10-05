import { NextResponse } from 'next/server';
import { NotesVoiceError } from './schema';
export const VOICE_REQUEST_LIMIT = 4 * 1024 * 1024 + 64 * 1024;
export async function readVoiceForm(request: Request) {
  if (!request.body) throw new NotesVoiceError(400, 'missing_audio');
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new NotesVoiceError(408, 'upload_timeout')),
      20_000
    );
  });
  try {
    while (true) {
      const item = await Promise.race([reader.read(), deadline]);
      if (item.done) break;
      total += item.value.byteLength;
      if (total > VOICE_REQUEST_LIMIT)
        throw new NotesVoiceError(413, 'upload_limit');
      chunks.push(item.value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return await new Request(request.url, {
        method: 'POST',
        headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
        body,
      }).formData();
    } catch {
      throw new NotesVoiceError(400, 'invalid_multipart');
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
export function voiceErrorResponse(error: unknown) {
  const known = error instanceof NotesVoiceError;
  if (!known) console.error('Notes voice request failed');
  return NextResponse.json(
    { code: known ? error.code : 'notes_voice_unavailable' },
    {
      status: known ? error.status : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

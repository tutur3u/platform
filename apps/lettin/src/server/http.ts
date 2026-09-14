import { NextResponse } from 'next/server';
import { LettinError } from './context';

export function respond(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export async function handle(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LettinError)
      return respond({ message: error.message }, error.status);
    console.error('Lettin request failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return respond({ message: 'Request failed' }, 500);
  }
}
export async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new LettinError(413, 'Too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

import { ApiError } from './errors';

export async function readJsonBody(
  request: Request,
  limit: number,
  signal: AbortSignal = request.signal
): Promise<unknown> {
  if (!request.body) return null;
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new ApiError('bad_request', 400, 'Expected application/json');
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted)
        throw new ApiError(
          'deadline_exceeded',
          504,
          'Request deadline exceeded'
        );
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new ApiError(
          'payload_too_large',
          413,
          'Request body is too large'
        );
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
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
    throw new ApiError('bad_request', 400, 'Invalid JSON');
  }
}

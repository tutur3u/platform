export async function nativeIntegrityBody(
  request: Request,
  limit: number
): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new Error('Integrity request body too large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

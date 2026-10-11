/** Finite ingress reads; this does not limit aggregate requests or DO spending. */
const MAX_BYTES = 2048;
const MAX_READS = 256;
const DEADLINE_MS = 5000;

export async function coordinationBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  const deadline = Date.now() + DEADLINE_MS;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let reads = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Body deadline exceeded')),
      DEADLINE_MS
    );
  });
  try {
    for (;;) {
      if (Date.now() >= deadline) throw new Error('Body deadline exceeded');
      if (reads >= MAX_READS) throw new Error('Too many body reads');
      reads++;
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (Date.now() >= deadline) throw new Error('Body deadline exceeded');
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Body too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    clearTimeout(timer);
    // A stalled source cancellation must not extend the request deadline.
    try {
      void reader.cancel().catch(() => {});
    } catch {
      // Preserve the parse/read failure if a source cannot be cancelled.
    }
  }
}

export async function readLiveRequestBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false as const, status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const data: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );
    return { ok: true as const, data };
  } catch {
    return { ok: false as const, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

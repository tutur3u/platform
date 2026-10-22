/** Reads actual response bytes; Content-Length is only an early rejection hint. */
export function readBoundedResponseBytes({
  response,
  maxBytes,
  tooLargeMessage = 'response_body_too_large',
}: {
  response: Pick<Response, 'body' | 'headers'>;
  maxBytes: number;
  tooLargeMessage?: string;
}): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }
  return readResponseBytes(response, maxBytes, tooLargeMessage);
}

async function readResponseBytes(
  response: Pick<Response, 'body' | 'headers'>,
  maxBytes: number,
  tooLargeMessage: string
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  try {
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new Error(tooLargeMessage);
    }
    if (!reader) return new Uint8Array(0);

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - totalBytes) {
        throw new Error(tooLargeMessage);
      }
      totalBytes += value.byteLength;
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    try {
      await reader?.cancel(error);
    } catch {
      // Preserve the read/limit error if cancellation also fails.
    }
    throw error;
  } finally {
    reader?.releaseLock();
  }
}

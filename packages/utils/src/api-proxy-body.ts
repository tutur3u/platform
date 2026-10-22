import { type NextRequest, NextResponse } from 'next/server';
import { MAX_PAYLOAD_SIZE } from './constants';

async function requestBodyExceedsLimit(req: NextRequest, maxBytes: number) {
  const body = req.clone().body;
  if (!body) return false;
  const reader = body.getReader();
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        void reader.cancel().catch(() => {});
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** The caller may supply an explicit route bound; all other routes keep 512 KiB. */
export async function guardApiProxyBody(
  req: NextRequest,
  maxBytes = MAX_PAYLOAD_SIZE
) {
  const contentLength = req.headers.get('content-length');
  const size = contentLength ? Number.parseInt(contentLength, 10) : 0;
  if (
    (!Number.isNaN(size) && size > maxBytes) ||
    (await requestBodyExceedsLimit(req, maxBytes))
  ) {
    return NextResponse.json(
      { error: 'Payload Too Large', message: 'Request body exceeds limit' },
      { status: 413 }
    );
  }
  return null;
}

import { readBoundedResponseBytes } from '@tuturuuu/utils/read-bounded-response';

export async function fetchZaloPersonalAttachment({
  url,
  userAgent,
}: {
  url: string;
  userAgent: string;
}): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`zalo_personal_media_fetch_failed_${response.status}`);
  }
  const bytes = await readBoundedResponseBytes({
    response,
    maxBytes: 25 * 1024 * 1024,
    tooLargeMessage: 'zalo_personal_media_too_large',
  });
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

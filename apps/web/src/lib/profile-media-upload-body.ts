import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';

/** Bound actual streamed bytes, including requests without Content-Length. */
export async function readProfileMediaBody(request: Request, maximum: number) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum))
    throw new ProfileUploadError('Source image exceeds the size limit', 413);
  if (!request.body) throw new ProfileUploadError('Empty profile image', 400);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ProfileUploadError('Image upload timed out', 408)),
      20_000
    );
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > maximum)
        throw new ProfileUploadError(
          'Source image exceeds the size limit',
          413
        );
      chunks.push(Buffer.from(value));
    }
    if (!total) throw new ProfileUploadError('Empty profile image', 400);
    return Buffer.concat(chunks, total);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

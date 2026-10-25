import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

export const MAX_CLI_DOWNLOAD_BYTES = 64 * 1024 * 1024;

/** The caller supplies an exclusively created private staging directory. */
export async function downloadVerifiedArchive(
  response: Response,
  path: string,
  integrity: string,
  { maxBytes = MAX_CLI_DOWNLOAD_BYTES } = {}
) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_CLI_DOWNLOAD_BYTES
  )
    throw new Error('Invalid CLI download limit.');
  const length = response.headers.get('content-length');
  if (
    length !== null &&
    (!/^\d+$/u.test(length) || Number(length) > maxBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('CLI archive exceeds the download size limit.');
  }
  if (!response.body) throw new Error('CLI archive response has no body.');
  // wx+ is an exclusive read/write create: existing files and symlinks cannot be reused.
  const reader = response.body.getReader();
  const file = await open(path, 'wx+', 0o600).catch(async (error: unknown) => {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    throw error;
  });
  try {
    await file.chmod(0o600);
    const hash = createHash('sha512');
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.byteLength > maxBytes - size)
        throw new Error('CLI archive exceeds the download size limit.');
      size += chunk.value.byteLength;
      hash.update(chunk.value);
      await file.writeFile(chunk.value);
    }
    if (`sha512-${hash.digest('base64')}` !== integrity)
      throw new Error(
        'CLI archive failed its registry integrity check; nothing was installed.'
      );

    // Only authenticated bytes may reach the extractor. Read the same created fd,
    // not its pathname, and authenticate the persisted bytes as well.
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size !== BigInt(size))
      throw new Error('CLI download file changed during verification.');
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await file.read(
        bytes,
        offset,
        size - offset,
        offset
      );
      if (bytesRead === 0) throw new Error('CLI download file was truncated.');
      offset += bytesRead;
    }
    const after = await file.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.nlink !== after.nlink ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      `sha512-${createHash('sha512').update(bytes).digest('base64')}` !==
        integrity
    )
      throw new Error('CLI download file changed during verification.');
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
    await file.close();
  }
}

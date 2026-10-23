import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, open, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';

// Replace an owned file only after a complete write and caller revalidation.
// A failed temp cleanup must not replace the original write/rename failure.
export async function writeFileAtomically(
  target,
  contents,
  { move = rename, remove = rm, writeOptions = {}, beforeMove = () => {} } = {}
) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  let failed = false;
  let primaryError;
  try {
    const targetInfo = await lstat(target).catch((error) => {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    });
    if (targetInfo && !targetInfo.isFile())
      throw new Error('Atomic file target must be a regular file');
    const mode =
      writeOptions.mode ?? (targetInfo ? targetInfo.mode & 0o777 : 0o600);
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      mode
    );
    try {
      await file.writeFile(contents, writeOptions.encoding);
    } finally {
      await file.close();
    }
    await beforeMove();
    if (writeOptions.flag === 'wx') {
      await link(temporary, target);
      await unlink(temporary);
    } else {
      await move(temporary, target);
    }
  } catch (error) {
    failed = true;
    primaryError = error;
  }
  try {
    await remove(temporary, { force: true });
  } catch (cleanupError) {
    if (!failed) {
      failed = true;
      primaryError = cleanupError;
    }
  }
  if (failed) throw primaryError;
}

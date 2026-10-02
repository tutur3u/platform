import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Replace an owned file only after a complete write and caller revalidation.
// A failed temp cleanup must not replace the original write/rename failure.
export async function writeFileAtomically(
  target,
  contents,
  {
    write = writeFile,
    move = rename,
    remove = rm,
    writeOptions = { flag: 'wx' },
    beforeMove = () => {},
  } = {}
) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  let failed = false;
  let primaryError;
  try {
    await write(temporary, contents, writeOptions);
    await beforeMove();
    await move(temporary, target);
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

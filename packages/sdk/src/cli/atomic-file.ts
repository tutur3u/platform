import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

/** Write a complete file beside its destination, then atomically replace it. */
export async function writeFileAtomically(
  path: string,
  contents: string,
  options: {
    mode?: number;
    createDirectory?: boolean;
    directoryMode?: number;
  } = {}
) {
  const target = resolve(path);
  const parent = dirname(target);
  if (options.createDirectory)
    await mkdir(parent, {
      mode: options.directoryMode,
      recursive: true,
    });

  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (info && !info.isFile())
    throw new Error('Atomic file target must be a regular file');

  const mode = options.mode ?? (info ? info.mode & 0o777 : 0o666);
  const temporary = resolve(
    parent,
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  let failed = false;
  let primaryError: unknown;
  try {
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      mode
    );
    try {
      await file.writeFile(contents, 'utf8');
      if (info) await file.chmod(mode);
    } finally {
      await file.close();
    }
    await rename(temporary, target);
  } catch (error) {
    failed = true;
    primaryError = error;
  }
  try {
    await rm(temporary, { force: true });
  } catch (error) {
    if (!failed) {
      failed = true;
      primaryError = error;
    }
  }
  if (failed) throw primaryError;
  return target;
}

export function writeFileAtomicallySync(path: string, contents: string) {
  const target = resolve(path);
  const parent = dirname(target);
  let info: ReturnType<typeof lstatSync> | undefined;
  try {
    info = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (info && !info.isFile())
    throw new Error('Atomic file target must be a regular file');
  const temporary = resolve(
    parent,
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`
  );
  let fd: number | undefined;
  try {
    fd = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      info ? Number(info.mode) & 0o777 : 0o666
    );
    writeFileSync(fd, contents, 'utf8');
    if (info) fchmodSync(fd, Number(info.mode) & 0o777);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, target);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT')
        throw cleanupError;
    }
    throw error;
  }
  try {
    unlinkSync(temporary);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return target;
}

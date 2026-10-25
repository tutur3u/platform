import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { link, lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export const MAX_SECRET_BYTES = 5 * 1024 * 1024;
export const MAX_CREDENTIALS_BYTES = 16 * 1024;

export type SecretsFileFailure =
  | 'unreadable'
  | 'not-regular'
  | 'too-large'
  | 'empty'
  | 'unsafe-permissions'
  | 'changed'
  | 'exists'
  | 'unsafe-output'
  | 'write-failed';

// Fixed text only: a message never carries a path, name or value.
const MESSAGES: Record<SecretsFileFailure, string> = {
  unreadable: 'File could not be opened for reading',
  'not-regular':
    'Path must be a regular file; symbolic links and special files are refused',
  'too-large': 'File exceeds the size limit',
  empty: 'File is empty',
  'unsafe-permissions':
    'File must be owned by you and readable by you alone (chmod 600)',
  changed: 'File changed while it was being read',
  exists: 'Output file already exists; pass --force to replace it',
  'unsafe-output':
    'Output path must be a new or existing regular file in an existing directory, never a symbolic link',
  'write-failed': 'Output file could not be written',
};

export class SecretsFileError extends Error {
  constructor(readonly reason: SecretsFileFailure) {
    super(MESSAGES[reason]);
    this.name = 'SecretsFileError';
  }
}

export function wipe(...buffers: (Uint8Array | undefined)[]) {
  for (const buffer of buffers) buffer?.fill(0);
}

function errorCode(error: unknown) {
  return error instanceof Error && 'code' in error
    ? String(error.code)
    : undefined;
}

export interface ReadOptions {
  maxBytes: number;
  allowEmpty?: boolean;
  /** Credential files: regular, owned by this user, mode 0600-or-stricter, one link. */
  requirePrivate?: boolean;
}

/**
 * Reads one regular file through a single descriptor. O_NOFOLLOW refuses a
 * symlink leaf and O_NONBLOCK keeps a FIFO from hanging the open; the checks
 * run on the opened descriptor so they cannot be raced by swapping the path.
 * The returned buffer belongs to the caller, which must `wipe` it.
 */
export async function readRegularFile(path: string, options: ReadOptions) {
  let handle: FileHandle | undefined;
  let bytes: Buffer | undefined;
  try {
    try {
      handle = await open(
        resolve(path),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
    } catch (error) {
      throw new SecretsFileError(
        errorCode(error) === 'ELOOP' ? 'not-regular' : 'unreadable'
      );
    }
    const before = await handle.stat();
    if (!before.isFile()) throw new SecretsFileError('not-regular');
    if (options.requirePrivate) {
      const foreign =
        typeof process.getuid === 'function' && before.uid !== process.getuid();
      if (foreign || (before.mode & 0o077) !== 0 || before.nlink !== 1)
        throw new SecretsFileError('unsafe-permissions');
    }
    if (before.size > options.maxBytes) throw new SecretsFileError('too-large');
    if (before.size === 0 && !options.allowEmpty)
      throw new SecretsFileError('empty');

    bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset
      );
      if (bytesRead === 0) throw new SecretsFileError('changed');
      offset += bytesRead;
    }
    // A file that grew past its stat size is not the file we measured.
    const probe = Buffer.alloc(1);
    if ((await handle.read(probe, 0, 1, bytes.length)).bytesRead !== 0)
      throw new SecretsFileError('changed');
    const after = await handle.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      before.ino !== after.ino
    )
      throw new SecretsFileError('changed');
    return bytes;
  } catch (error) {
    wipe(bytes);
    throw error instanceof SecretsFileError
      ? error
      : new SecretsFileError('unreadable');
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function readSourceFile(path: string) {
  return readRegularFile(path, { maxBytes: MAX_SECRET_BYTES });
}

export function readCredentialsFile(path: string) {
  return readRegularFile(path, {
    maxBytes: MAX_CREDENTIALS_BYTES,
    requirePrivate: true,
  });
}

export interface WriteOptions {
  /** Atomically replace an existing regular file. Never follows or replaces a link. */
  replace?: boolean;
}

/**
 * Writes bytes to a mode 0600 temporary file beside the destination, syncs it,
 * then publishes it atomically: link(2) refuses to overwrite (EEXIST, even for
 * a dangling symlink) and rename(2) swaps the directory entry without ever
 * writing through a link. The caller keeps ownership of `bytes` and wipes them.
 */
export async function writePrivateFile(
  path: string,
  bytes: Uint8Array,
  options: WriteOptions = {}
) {
  if (bytes.byteLength > MAX_SECRET_BYTES)
    throw new SecretsFileError('too-large');
  const requested = resolve(path);
  let parent: string;
  try {
    parent = await realpath(dirname(requested));
  } catch {
    throw new SecretsFileError('unsafe-output');
  }
  const destination = join(parent, basename(requested));
  try {
    const existing = await lstat(destination);
    if (!existing.isFile()) throw new SecretsFileError('unsafe-output');
    if (!options.replace) throw new SecretsFileError('exists');
  } catch (error) {
    if (error instanceof SecretsFileError) throw error;
    if (errorCode(error) !== 'ENOENT')
      throw new SecretsFileError('unsafe-output');
  }

  const temporary = join(parent, `.ttr-secret-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let created = false;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    created = true;
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (options.replace) {
      await rename(temporary, destination);
      created = false;
    } else {
      await link(temporary, destination);
    }
  } catch (error) {
    throw new SecretsFileError(
      errorCode(error) === 'EEXIST' ? 'exists' : 'write-failed'
    );
  } finally {
    await handle?.close().catch(() => undefined);
    if (created) await unlink(temporary).catch(() => undefined);
  }
  await syncDirectory(parent);
}

async function syncDirectory(directory: string) {
  let handle: FileHandle | undefined;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some filesystems; the data is synced.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

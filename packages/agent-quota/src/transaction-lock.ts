import { constants } from 'node:fs';
import { type FileHandle, lstat, open, unlink } from 'node:fs/promises';
import { processStartedAt, processState } from './process-identity';

const FLAGS =
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_WRONLY |
  constants.O_NOFOLLOW;
async function create(path: string): Promise<FileHandle> {
  const startedAt = processStartedAt(process.pid);
  if (!startedAt) throw Error('transaction-owner-unverified');
  const file = await open(path, FLAGS, 0o600);
  try {
    await file.writeFile(
      JSON.stringify({ pid: process.pid, processStartedAt: startedAt })
    );
    await file.sync();
    return file;
  } catch (error) {
    await file.close();
    await unlink(path);
    throw error;
  }
}
export async function acquireTransactionLock(
  path: string,
  depth = 0
): Promise<FileHandle> {
  try {
    return await create(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  // Serialize dead-owner reclamation so a replacement lock cannot be unlinked by another reclaimer.
  if (depth >= 4) throw Error('transaction-reclamation-busy');
  const reclaim = await acquireTransactionLock(`${path}.reclaim`, depth + 1);
  try {
    const old = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await old.stat();
      if (!stat.isFile() || stat.size > 2048)
        throw Error('transaction-lock-invalid');
      const owner = JSON.parse(await old.readFile('utf8'));
      if (
        !Number.isInteger(owner.pid) ||
        owner.pid < 1 ||
        typeof owner.processStartedAt !== 'string'
      )
        throw Error('transaction-lock-invalid');
      if (
        !['dead', 'replaced'].includes(
          processState(owner.pid, owner.processStartedAt)
        )
      )
        throw Error('transaction-owner-live-or-unverified');
      const current = await lstat(path);
      if (current.ino !== stat.ino || current.dev !== stat.dev)
        throw Error('transaction-lock-changed');
      await unlink(path);
      return await create(path);
    } finally {
      await old.close();
    }
  } finally {
    await releaseTransactionLock(`${path}.reclaim`, reclaim);
  }
}
export async function releaseTransactionLock(path: string, file: FileHandle) {
  try {
    const owned = await file.stat();
    const current = await lstat(path);
    if (owned.ino === current.ino && owned.dev === current.dev)
      await unlink(path);
  } finally {
    await file.close();
  }
}

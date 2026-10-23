import { constants } from 'node:fs';
import { type FileHandle, lstat, open, unlink } from 'node:fs/promises';
import { processStartedAt, processState } from './process-identity';

const FLAGS =
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_WRONLY |
  constants.O_NOFOLLOW;
export const INCOMPLETE_LOCK_GRACE_MS = 10_000;
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

async function createAfterReclamation(path: string): Promise<FileHandle> {
  try {
    return await create(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw Error('transaction-lock-changed');
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
    let old: FileHandle;
    try {
      old = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw Error('transaction-lock-disappeared');
      throw error;
    }
    try {
      const stat = await old.stat();
      if (!stat.isFile() || stat.size > 2048)
        throw Error('transaction-lock-invalid');
      const reclaimIncomplete = async () => {
        if (Date.now() - stat.mtimeMs < INCOMPLETE_LOCK_GRACE_MS)
          throw Error('transaction-lock-incomplete');
        const current = await lstat(path);
        if (current.ino !== stat.ino || current.dev !== stat.dev)
          throw Error('transaction-lock-changed');
        await unlink(path);
        return createAfterReclamation(path);
      };
      let owner: { pid?: unknown; processStartedAt?: unknown };
      try {
        const raw = await old.readFile('utf8');
        if (!raw.trim()) throw Error('empty');
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw Error('invalid');
        owner = parsed as { pid?: unknown; processStartedAt?: unknown };
      } catch {
        return await reclaimIncomplete();
      }
      const pid = owner.pid;
      const startedAt = owner.processStartedAt;
      if (
        typeof pid !== 'number' ||
        !Number.isInteger(pid) ||
        pid < 1 ||
        typeof startedAt !== 'string'
      )
        return await reclaimIncomplete();
      if (!['dead', 'replaced'].includes(processState(pid, startedAt)))
        throw Error('transaction-owner-live-or-unverified');
      const current = await lstat(path);
      if (current.ino !== stat.ino || current.dev !== stat.dev)
        throw Error('transaction-lock-changed');
      await unlink(path);
      return await createAfterReclamation(path);
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

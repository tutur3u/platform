import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HookLedger } from './hooks-types';
import { pruneLedger } from './ledger-retention';
import { validLedger } from './ledger-validation';
import {
  acquireTransactionLock,
  releaseTransactionLock,
} from './transaction-lock';

export const hookDirectory = () =>
  join(homedir(), '.t3', 'caches', 'agent-quota');
export const emptyLedger = (): HookLedger => ({
  version: 1,
  observations: [],
  reservations: [],
  leases: [],
  leaseHistory: [],
});
export class HookError extends Error {}

export async function readLedger(
  directory = hookDirectory()
): Promise<HookLedger> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      join(directory, 'hooks.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const info = await handle.stat();
    if (!info.isFile() || info.size > 2_000_000)
      throw new HookError('ledger-invalid-or-full');
    const value = JSON.parse(await handle.readFile('utf8'));
    if (!validLedger(value)) throw new HookError('ledger-invalid');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return emptyLedger();
    throw new HookError('ledger-unreadable');
  } finally {
    await handle?.close();
  }
}

// One short file transaction, never a background controller. A dead mutex owner can be reclaimed after verifying its process identity.
export async function transactLedger<T>(
  operation: (ledger: HookLedger) => T | Promise<T>,
  directory = hookDirectory()
): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory())
    throw new HookError('ledger-directory-invalid');
  const lockPath = join(directory, 'transaction.lock');
  let lock: FileHandle;
  try {
    lock = await acquireTransactionLock(lockPath);
  } catch {
    throw new HookError('ledger-busy');
  }
  const temporary = join(directory, `hooks-${randomUUID()}.tmp`);
  try {
    const ledger = await readLedger(directory);
    // Admission prunes reservations using the native active set; storage maintenance
    // preserves those reservations and only compacts expired event history.
    pruneLedger(
      ledger,
      new Date(),
      ledger.reservations.flatMap((item) =>
        item.nativeReservationId ? [item.nativeReservationId] : []
      )
    );
    const result = await operation(ledger);
    const content = JSON.stringify(ledger);
    if (Buffer.byteLength(content) > 2_000_000)
      throw new HookError('ledger-full');
    const file = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600
    );
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(directory, 'hooks.json'));
    const dir = await open(directory, constants.O_RDONLY);
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
    return result;
  } finally {
    await unlink(temporary).catch(() => {});
    await releaseTransactionLock(lockPath, lock);
  }
}

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Owner {
  pid: number;
  identity: string | null;
  nonce: string;
}
async function identity(pid: number) {
  try {
    const boot = await readFile('/proc/sys/kernel/random/boot_id', 'utf8');
    const processStat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return `${boot.trim()}:${processStat.slice(processStat.lastIndexOf(')') + 2).split(' ')[19]}`;
  } catch {
    if (process.platform !== 'darwin') return null;
    const result = spawnSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' },
    });
    return result.status === 0 ? result.stdout.trim() || null : null;
  }
}
async function alive(owner: Owner) {
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    return true;
  }
  const current = await identity(owner.pid);
  return !owner.identity || !current || owner.identity === current;
}
async function readOwner(lock: string): Promise<Owner | null> {
  try {
    const owner = JSON.parse(
      await readFile(join(lock, 'owner.json'), 'utf8')
    ) as Owner;
    return Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      typeof owner.nonce === 'string' &&
      (owner.identity === null || typeof owner.identity === 'string')
      ? owner
      : null;
  } catch {
    return null;
  }
}

/** Never evict by age: a live install may be slow. PID identity detects reboots/reuse. */
export async function acquireUpgradeLock(lock: string, isAlive = alive) {
  const owner: Owner = {
    pid: process.pid,
    identity: await identity(process.pid),
    nonce: randomUUID(),
  };
  const claim = async () => {
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    try {
      await writeFile(join(lock, 'owner.json'), JSON.stringify(owner), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      await rm(lock, { recursive: true, force: true });
      throw error;
    }
    return true;
  };
  const release = async () => {
    if ((await readOwner(lock))?.nonce === owner.nonce)
      await rm(lock, { recursive: true, force: true });
  };
  if (await claim()) return release;
  const previous = await readOwner(lock);
  // Unknown legacy/crash state requires inspection, never speculative eviction.
  if (!previous || (await isAlive(previous))) return undefined;
  const reclaim = `${lock}.reclaim`;
  try {
    await mkdir(reclaim, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined;
    throw error;
  }
  try {
    // Serialize reclaimers and re-read so an observer cannot delete a new owner.
    const latest = await readOwner(lock);
    if (!latest || (await isAlive(latest))) return undefined;
    await rm(lock, { recursive: true });
    return (await claim()) ? release : undefined;
  } finally {
    await rm(reclaim, { recursive: true, force: true });
  }
}

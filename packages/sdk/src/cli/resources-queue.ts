import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { constants, setPriority } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { atomicJson } from './resources-config';
import { memoryPressure } from './resources-diagnostics';

export interface ResourceOwner {
  pid: number;
  childPid?: number;
  token: string;
  cwd: string;
  tool: string;
  queuedAt: string;
  startedAt?: string;
}

export function processAlive(pid?: number) {
  if (!pid || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readOwner(
  path: string
): Promise<ResourceOwner | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ResourceOwner;
  } catch {
    return undefined;
  }
}

export function isAncestor(pid: number) {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], {
      encoding: 'utf8',
      timeout: 3000,
    })
      .trim()
      .split('\n');
    const table = new Map(
      rows.map((row) => row.trim().split(/\s+/).map(Number) as [number, number])
    );
    const seen = new Set<number>();
    let parent = process.ppid;
    while (parent > 1 && !seen.has(parent)) {
      if (parent === pid) return true;
      seen.add(parent);
      parent = table.get(parent) || 1;
    }
  } catch {
    /* Without ancestry evidence, do not bypass admission. */
  }
  return false;
}

export async function resourceQueueStatus(home: string) {
  const owner = await readOwner(join(home, 'lock', 'owner.json'));
  const files = await readdir(join(home, 'queue')).catch(() => [] as string[]);
  const waiting = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => readOwner(join(home, 'queue', file)))
  );
  return {
    owner:
      owner && (processAlive(owner.pid) || processAlive(owner.childPid))
        ? owner
        : null,
    waiting: waiting.filter((item) => item && processAlive(item.pid)),
  };
}

function signalChild(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    /* Owned child group has exited. */
  }
}

export async function spawnResourceCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  owned = false,
  onSpawn?: (pid: number) => Promise<void>
) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: 'inherit',
      detached: owned,
    });
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const handlers = signals.map((signal) => {
      const handler = () => {
        if (child.pid) {
          if (owned) signalChild(child.pid, signal);
          else child.kill(signal);
        }
      };
      process.on(signal, handler);
      return handler;
    });
    const clean = () =>
      signals.forEach((signal, i) => {
        process.removeListener(signal, handlers[i]!);
      });
    let receipt = Promise.resolve();
    child.once('spawn', () => {
      if (owned && child.pid) {
        try {
          setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
        } catch {
          /* Priority is advisory. */
        }
      }
      if (child.pid && onSpawn) receipt = onSpawn(child.pid);
    });
    child.once('error', (error) => {
      clean();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clean();
      void receipt.then(
        () =>
          resolve(
            code ??
              (signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143)
          ),
        reject
      );
    });
  });
}

export async function queuedResourceCommand(
  home: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  ignorePressure = false
) {
  if (process.platform === 'win32')
    throw new Error('Resource admission currently supports macOS and Linux.');
  const lock = join(home, 'lock');
  const ownerPath = join(lock, 'owner.json');
  const previous = await readOwner(ownerPath);
  // Works even when Turbo strict env removes TTR_RESOURCE_OWNER.
  if (previous && processAlive(previous.pid) && isAncestor(previous.pid)) {
    return spawnResourceCommand(command, args, env);
  }
  const queue = join(home, 'queue');
  await mkdir(queue, { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const ticket = join(queue, `${Date.now()}-${token}.json`);
  const owner: ResourceOwner = {
    pid: process.pid,
    token,
    cwd: process.cwd(),
    tool: command.split('/').pop() || command,
    queuedAt: new Date().toISOString(),
  };
  await atomicJson(ticket, owner);
  let claimed = false;
  let cancelled = 0;
  const cancelInt = () => {
    cancelled = 130;
  };
  const cancelTerm = () => {
    cancelled = 143;
  };
  process.on('SIGINT', cancelInt);
  process.on('SIGTERM', cancelTerm);
  process.on('SIGHUP', cancelTerm);
  try {
    let announced = 0;
    let pressureCheckedAt = 0;
    let pressure = { blocked: false, reason: null as string | null };
    for (;;) {
      if (cancelled) return cancelled;
      const files = (await readdir(queue))
        .filter((file) => file.endsWith('.json'))
        .sort();
      const live: string[] = [];
      for (const file of files) {
        const path = join(queue, file);
        const item = await readOwner(path);
        if (item && processAlive(item.pid)) live.push(path);
        else await rm(path, { force: true });
      }
      if (!ignorePressure && Date.now() - pressureCheckedAt > 5000) {
        pressure = await memoryPressure();
        pressureCheckedAt = Date.now();
      }
      if (live[0] === ticket && !pressure.blocked) {
        try {
          await mkdir(lock, { mode: 0o700 });
          claimed = true;
          owner.startedAt = new Date().toISOString();
          await atomicJson(ownerPath, owner);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const active = await readOwner(ownerPath);
          const age =
            Date.now() -
            (await stat(lock).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
          // The head waiter alone reclaims; never expire a live process by elapsed time.
          if (
            active
              ? !processAlive(active.pid) && !processAlive(active.childPid)
              : age > 30_000
          ) {
            await rm(lock, { recursive: true, force: true });
            continue;
          }
        }
      }
      if (Date.now() - announced > 30_000) {
        process.stderr.write(
          `[ttr resources] queued PID ${process.pid}; ${pressure.reason || 'waiting for the shared validation slot'}\n`
        );
        announced = Date.now();
      }
      await sleep(250);
    }
    await rm(ticket, { force: true });
    if (cancelled) return cancelled;
    process.stderr.write(`[ttr resources] running PID ${process.pid}\n`);
    const code = await spawnResourceCommand(
      command,
      args,
      { ...env, TTR_RESOURCE_OWNER: token },
      true,
      async (pid) => {
        owner.childPid = pid;
        await atomicJson(ownerPath, owner);
      }
    );
    process.stderr.write(`[ttr resources] finished; exit ${code}\n`);
    return code;
  } finally {
    process.removeListener('SIGINT', cancelInt);
    process.removeListener('SIGTERM', cancelTerm);
    process.removeListener('SIGHUP', cancelTerm);
    await rm(ticket, { force: true });
    if (claimed && (await readOwner(ownerPath))?.token === token) {
      await rm(lock, { recursive: true, force: true });
    }
  }
}

export async function hasResourceOwner(home: string) {
  const owner = await readOwner(join(home, 'lock', 'owner.json'));
  return Boolean(owner && processAlive(owner.pid) && isAncestor(owner.pid));
}

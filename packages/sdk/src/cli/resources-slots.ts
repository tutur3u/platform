import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { readResourceConfig, resourceMaxLanes } from './resources-config';

const ownerSchema = z.object({
  scheduler: z.literal(2).optional(),
  pid: z.number().int().positive(),
  childPid: z.number().int().positive().optional(),
  token: z.string().min(1),
  cwd: z.string(),
  tool: z.string(),
  command: z.string().optional(),
  queuedAt: z.string(),
  startedAt: z.string().optional(),
  limits: z
    .object({
      vitestWorkers: z.number().int().positive(),
      buildJobs: z.number().int().positive(),
    })
    .optional(),
});
export type ResourceOwner = z.infer<typeof ownerSchema>;
export type OwnerState =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'owner'; owner: ResourceOwner };
export const initializationGrace = 30_000;

export function errno(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code;
}
export function processAlive(pid?: number) {
  if (!pid || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !errno(error, 'ESRCH');
  }
}
export function processGroupAlive(pid: number) {
  try {
    process.kill(-pid, 0);
  } catch (error) {
    return !errno(error, 'ESRCH');
  }
  try {
    return execFileSync('ps', ['-axo', 'pgid=,stat='], {
      encoding: 'utf8',
      timeout: 3000,
    })
      .split('\n')
      .some((row) => {
        const [group, state] = row.trim().split(/\s+/);
        return Number(group) === pid && state && !state.startsWith('Z');
      });
  } catch {
    return true;
  }
}
export function ownerAlive(owner: ResourceOwner) {
  return (
    processAlive(owner.pid) ||
    processAlive(owner.childPid) ||
    (owner.childPid !== undefined && processGroupAlive(owner.childPid))
  );
}
export async function ownerState(path: string): Promise<OwnerState> {
  try {
    const parsed = ownerSchema.safeParse(
      JSON.parse(await readFile(path, 'utf8'))
    );
    return parsed.success
      ? { kind: 'owner', owner: parsed.data }
      : { kind: 'invalid' };
  } catch (error) {
    return errno(error, 'ENOENT') ? { kind: 'missing' } : { kind: 'invalid' };
  }
}
export async function readOwner(path: string) {
  const state = await ownerState(path);
  return state.kind === 'owner' ? state.owner : undefined;
}
export const admittedMarker = 'TTR_RESOURCES_ADMITTED';
export interface ProcessLineage {
  pids: Set<number>;
  group?: number;
}
let lineage: ProcessLineage | undefined;
// Ancestors only change when they exit, so a successful snapshot is reused.
// Failed snapshots are not cached; callers retry on their next check.
export function processLineage(refresh = false): ProcessLineage | undefined {
  if (lineage && !refresh) return lineage;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid='], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 16 * 1024 * 1024,
      })
        .trim()
        .split('\n');
      const table = new Map<number, { parent: number; group: number }>();
      for (const row of rows) {
        const [child, parent, group] = row.trim().split(/\s+/).map(Number);
        if (child && parent) table.set(child, { parent, group: group || 0 });
      }
      const pids = new Set<number>();
      let parent = process.ppid;
      while (parent > 1 && !pids.has(parent)) {
        pids.add(parent);
        parent = table.get(parent)?.parent || 1;
      }
      lineage = { pids, group: table.get(process.pid)?.group || undefined };
      return lineage;
    } catch {
      /* Retry once; missing evidence never permits nesting by itself. */
    }
  }
  return undefined;
}
export function isAncestor(pid: number) {
  return processLineage()?.pids.has(pid) ?? false;
}
// The owned launcher is a detached session and group leader, so a process in
// its group descends from the admitted job even after an intermediate parent
// exits and the process is reparented.
function descendsFrom(owner: ResourceOwner, evidence: ProcessLineage) {
  return (
    (processAlive(owner.pid) && evidence.pids.has(owner.pid)) ||
    (owner.childPid !== undefined &&
      processAlive(owner.childPid) &&
      (evidence.pids.has(owner.childPid) || evidence.group === owner.childPid))
  );
}
export function newOwner(tool: string, command?: string): ResourceOwner {
  return {
    scheduler: 2,
    pid: process.pid,
    token: randomUUID(),
    cwd: process.cwd(),
    tool,
    ...(command ? { command } : {}),
    queuedAt: new Date().toISOString(),
  };
}
async function directoryExists(path: string) {
  try {
    if (!(await stat(path)).isDirectory())
      throw new Error(`Invalid resource directory: ${path}`);
    return true;
  } catch (error) {
    if (errno(error, 'ENOENT')) return false;
    throw error;
  }
}

// The exclusive reclaim file prevents two stale observers removing a replacement
// mutex. Admission never enters an existing directory, including during reclaim.
async function reclaimMutex(path: string) {
  const identity = await stat(path);
  const before = await ownerState(join(path, 'owner.json'));
  if (before.kind === 'invalid')
    throw new Error('Malformed admission mutex; admission is closed.');
  if (before.kind === 'owner' && ownerAlive(before.owner)) return;
  if (before.kind === 'owner' && before.owner.tool === 'rollout')
    throw new Error(
      'Interrupted SDK rollout; admission remains closed. Run its backed-up rollback.sh before admitting work.'
    );
  if (
    before.kind === 'missing' &&
    Date.now() - (await stat(path)).mtimeMs <= initializationGrace
  )
    return;
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(join(path, 'reclaim'), 'wx', 0o600);
  } catch (error) {
    if (errno(error, 'EEXIST') || errno(error, 'ENOENT')) return;
    throw error;
  }
  await file.close();
  const currentIdentity = await stat(path);
  const current = await ownerState(join(path, 'owner.json'));
  if (
    identity.ino !== currentIdentity.ino ||
    identity.dev !== currentIdentity.dev ||
    current.kind !== before.kind ||
    (current.kind === 'owner' &&
      (ownerAlive(current.owner) ||
        before.kind !== 'owner' ||
        current.owner.token !== before.owner.token))
  ) {
    await rm(join(path, 'reclaim'), { force: true });
    return;
  }
  await rm(path, { recursive: true });
}
export async function withAdmission<T>(
  home: string,
  action: () => Promise<T>,
  cancelled = () => false
): Promise<T | undefined> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const path = join(home, 'admission');
  const owner = newOwner('admission');
  const staged = join(home, `admission.${owner.token}.tmp`);
  await writeFile(staged, `${JSON.stringify(owner)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  let acquired = false;
  try {
    while (!acquired) {
      if (cancelled()) return undefined;
      try {
        await mkdir(path, { mode: 0o700 });
      } catch (error) {
        if (!errno(error, 'EEXIST')) throw error;
        await reclaimMutex(path).catch((error) => {
          if (!errno(error, 'ENOENT')) throw error;
        });
        await sleep(25);
        continue;
      }
      // Hold the inode open; reuse the reclaim fence during owner publication.
      // Reclaim cannot remove an initializing directory while this fence exists.
      const directory = await open(path, 'r').catch((error) => {
        if (errno(error, 'ENOENT')) return undefined;
        throw error;
      });
      if (!directory) continue;
      let fence: Awaited<ReturnType<typeof open>> | undefined;
      try {
        const identity = await directory.stat();
        fence = await open(join(path, 'reclaim'), 'wx', 0o600);
        const before = await stat(path);
        if (identity.ino !== before.ino || identity.dev !== before.dev)
          continue;
        if ((await ownerState(join(path, 'owner.json'))).kind !== 'missing')
          continue;
        await link(staged, join(path, 'owner.json'));
        const current = await stat(path);
        const published = await readOwner(join(path, 'owner.json'));
        acquired =
          identity.ino === current.ino &&
          identity.dev === current.dev &&
          published?.token === owner.token;
      } catch (error) {
        if (!errno(error, 'ENOENT') && !errno(error, 'EEXIST')) throw error;
      } finally {
        if (fence) {
          const held = await fence.stat();
          const current = await stat(join(path, 'reclaim')).catch((error) => {
            if (errno(error, 'ENOENT')) return undefined;
            throw error;
          });
          if (current?.ino === held.ino && current.dev === held.dev)
            await rm(join(path, 'reclaim'));
          await fence.close();
        }
        await directory.close();
      }
    }
    return await action();
  } finally {
    if (acquired) await releaseMutex(path, owner.token);
    await rm(staged, { force: true });
  }
}

// Only setup may reenter an operator-held maintenance mutex. Queue admission
// deliberately never consults this capability.
export async function hasSetupMaintenanceLease(
  home: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const token = env.TTR_RESOURCES_MAINTENANCE;
  if (!token) return false;
  const owner = await readOwner(join(home, 'admission', 'owner.json'));
  return Boolean(
    owner?.tool === 'rollout' &&
      owner.scheduler === 2 &&
      owner.token === token &&
      processAlive(owner.pid) &&
      processLineage(true)?.pids.has(owner.pid)
  );
}

async function releaseMutex(path: string, token: string) {
  // Normal release uses the same exclusive removal marker as stale reclaim.
  // A stale observer cannot remove a newly initializing replacement directory.
  for (;;) {
    try {
      const removal = await open(join(path, 'reclaim'), 'wx', 0o600);
      await removal.close();
      break;
    } catch (error) {
      if (!errno(error, 'EEXIST')) throw error;
      await sleep(25);
    }
  }
  const current = await readOwner(join(path, 'owner.json'));
  if (current?.token === token) await rm(path, { recursive: true });
  else await rm(join(path, 'reclaim'), { force: true });
}
export async function occupancy(home: string, reclaim = false) {
  const config = await readResourceConfig(home);
  const maxLanes = config ? resourceMaxLanes(config) : 1;
  const slots = join(home, 'slots');
  const names = await readdir(slots).catch((error) => {
    if (errno(error, 'ENOENT')) return [];
    throw error;
  });
  if (
    names.some((name) => !/^(0|[1-7])$/.test(name) || Number(name) >= maxLanes)
  )
    throw new Error('Unknown resource slot; admission is closed.');
  const owners: ResourceOwner[] = [];
  const ownerSlots: string[] = [];
  const occupied: string[] = [];
  let legacy = false;
  let initializing = false;
  for (const path of [
    join(home, 'lock'),
    ...Array.from({ length: maxLanes }, (_, i) => join(slots, String(i))),
  ]) {
    if (!(await directoryExists(path))) continue;
    const state = await ownerState(join(path, 'owner.json'));
    if (state.kind === 'invalid')
      throw new Error('Malformed resource owner; admission is closed.');
    if (state.kind === 'owner' && ownerAlive(state.owner)) {
      owners.push(state.owner);
      ownerSlots.push(path);
      occupied.push(path);
    } else if (
      state.kind === 'missing' &&
      Date.now() - (await stat(path)).mtimeMs <= initializationGrace
    ) {
      occupied.push(path);
      initializing = true;
    } else if (reclaim) {
      const current = await ownerState(join(path, 'owner.json'));
      if (
        current.kind !== state.kind ||
        (current.kind === 'owner' &&
          (ownerAlive(current.owner) ||
            state.kind !== 'owner' ||
            current.owner.token !== state.owner.token))
      )
        throw new Error('Resource ownership changed during reclaim.');
      await rm(path, { recursive: true });
    } else {
      occupied.push(path);
    }
    if (path === join(home, 'lock') && occupied.includes(path)) legacy = true;
  }
  if (legacy && occupied.some((path) => path !== join(home, 'lock')))
    throw new Error('Mixed legacy and slot owners; admission is closed.');
  return { owners, ownerSlots, occupied, legacy, initializing };
}
export async function tickets(home: string, prune = false) {
  const queue = join(home, 'queue');
  const files = await readdir(queue).catch((error) => {
    if (errno(error, 'ENOENT')) return [];
    throw error;
  });
  const live: { path: string; owner: ResourceOwner }[] = [];
  for (const name of files.filter((file) => file.endsWith('.json')).sort()) {
    const path = join(queue, name);
    const state = await ownerState(path);
    if (state.kind === 'missing') continue;
    if (state.kind === 'invalid')
      throw new Error('Malformed queue ticket; admission is closed.');
    if (ownerAlive(state.owner)) live.push({ path, owner: state.owner });
    else if (prune) {
      const current = await readOwner(path);
      if (current?.token === state.owner.token && !ownerAlive(current))
        await rm(path, { force: true });
    }
  }
  return live;
}
const ignoredMarkers = new Set<string>();
// An admitted job exports its owner token. A marker counts only while it names
// a live owner, and, when ancestry evidence exists, only inside that owner's
// process tree, so stale or copied markers cannot bypass admission. Ancestry
// alone still covers children whose environment was filtered (Turbo strict).
export async function nestedOwner(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
  refresh = false
) {
  const state = await occupancy(home);
  const marker = env[admittedMarker] || env.TTR_RESOURCE_OWNER;
  const marked = marker
    ? state.owners.find((owner) => owner.token === marker)
    : undefined;
  if (!state.owners.length && !marker) return undefined;
  const evidence = state.owners.length ? processLineage(refresh) : undefined;
  if (!evidence) {
    if (marked) return marked;
  } else {
    if (marked && descendsFrom(marked, evidence)) return marked;
    const related = state.owners.find((owner) => descendsFrom(owner, evidence));
    if (related) return related;
  }
  if (marker && !ignoredMarkers.has(marker)) {
    ignoredMarkers.add(marker);
    process.stderr.write(
      `[ttr resources] ignoring ${admittedMarker}: it does not belong to a live admitted job in this process tree; queueing normally.\n`
    );
  }
  return undefined;
}
export async function releaseSlot(home: string, path: string, token: string) {
  await withAdmission(home, async () => {
    if ((await readOwner(join(path, 'owner.json')))?.token === token)
      await rm(path, { recursive: true });
  });
}

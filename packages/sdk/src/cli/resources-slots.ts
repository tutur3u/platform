import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, existsSync, readFileSync } from 'node:fs';
import {
  link,
  lstat,
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
import { assertBudgetLaunchers } from './resources-compatibility';
import {
  type ResourceConfig,
  readResourceConfig,
  resourceMaxLanes,
} from './resources-config';
import {
  originalProcessAlive,
  ownershipState,
  processInspection,
} from './resources-ownership';
import {
  ownershipFence,
  publishOwnershipFence,
  validOwnershipFence,
} from './resources-ownership-fence';
import { validateOwnershipRecord } from './resources-ownership-record';
import {
  requireProcessIdentity,
  snapshotProcesses,
} from './resources-process-identity';
import {
  type ProcessSnapshot,
  processIdentitySchema,
} from './resources-process-types';

const ownerSchema = z
  .object({
    scheduler: z.literal(2).optional(),
    pid: z.number().int().positive(),
    childPid: z.number().int().positive().optional(),
    ownershipVersion: z.literal(1).optional(),
    pidStart: processIdentitySchema.optional(),
    childStart: processIdentitySchema.optional(),
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
    // Declared budget demand (project share, worker tokens, memory). Older
    // schedulers strip it; owners without it retain their recorded worker cost.
    demand: z
      .object({
        project: z.string().min(1),
        tokens: z.number().int().positive(),
        memoryGiB: z.number().nonnegative(),
      })
      .optional(),
  })
  .superRefine(validateOwnershipRecord);
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
// Process liveness and ancestry decide admission, so ps must never be resolved
// through the caller's PATH (a fake ps could fabricate ancestry) or inherit
// loader variables such as LD_PRELOAD. Without a trusted ps there is no
// evidence, and callers fail closed.
const psCandidates = ['/bin/ps', '/usr/bin/ps'];
export function trustedPs(args: string[], timeout: number) {
  const ps = psCandidates.find((path) => existsSync(path));
  if (!ps)
    throw new Error('No trusted ps executable at /bin/ps or /usr/bin/ps.');
  return execFileSync(ps, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: { LC_ALL: 'C' },
  });
}
export function processGroupAlive(pid: number) {
  try {
    process.kill(-pid, 0);
  } catch (error) {
    return !errno(error, 'ESRCH');
  }
  try {
    return trustedPs(['-axo', 'pgid=,stat='], 3000)
      .split('\n')
      .some((row) => {
        const [group, state] = row.trim().split(/\s+/);
        return Number(group) === pid && state && !state.startsWith('Z');
      });
  } catch {
    return true;
  }
}
export function ownerAlive(owner: ResourceOwner, snapshot?: ProcessSnapshot) {
  return ownershipState(owner, snapshot).kind !== 'gone';
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
// Re-read ancestry: cached numeric ancestors can outlive the original process.
export function processLineage(refresh = false): ProcessLineage | undefined {
  void refresh;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rows = trustedPs(['-axo', 'pid=,ppid=,pgid='], 5000)
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
      return { pids, group: table.get(process.pid)?.group || undefined };
    } catch {
      /* Retry once; missing evidence never permits nesting by itself. */
    }
  }
  // Linux without a trusted ps: the kernel's /proc is not PATH-controlled.
  const fallback = procLineage();
  return fallback;
}
// Parent and process group from /proc/<pid>/stat. The command name (field 2)
// may contain spaces and parentheses, so fields are read after its last ')'.
function procStat(pid: number | 'self') {
  const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  const parent = Number(fields[1]);
  const group = Number(fields[2]);
  if (!Number.isInteger(parent) || !Number.isInteger(group))
    throw new Error('unreadable /proc stat');
  return { parent, group };
}
export function procLineage(): ProcessLineage | undefined {
  if (process.platform !== 'linux') return undefined;
  try {
    const pids = new Set<number>();
    let parent = process.ppid;
    while (parent > 1 && !pids.has(parent)) {
      pids.add(parent);
      try {
        parent = procStat(parent).parent || 1;
      } catch {
        // The ancestor exited between reads; the chain above it is gone.
        break;
      }
    }
    return { pids, group: procStat('self').group || undefined };
  } catch {
    return undefined;
  }
}
export function isAncestor(pid: number) {
  return processLineage()?.pids.has(pid) ?? false;
}
// The owned launcher is a detached session and group leader, so a process in
// its group descends from the admitted job even after an intermediate parent
// exits and the process is reparented.
function descendsFrom(
  owner: ResourceOwner,
  evidence: ProcessLineage,
  snapshot: ProcessSnapshot
) {
  return (
    (originalProcessAlive(owner.pid, owner.pidStart, snapshot) &&
      evidence.pids.has(owner.pid)) ||
    (owner.childPid !== undefined &&
      originalProcessAlive(owner.childPid, owner.childStart, snapshot) &&
      (evidence.pids.has(owner.childPid) || evidence.group === owner.childPid))
  );
}
export function newOwner(tool: string, command?: string): ResourceOwner {
  return {
    scheduler: 2,
    ownershipVersion: 1,
    pid: process.pid,
    pidStart: requireProcessIdentity(),
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
  if (before.kind === 'owner') {
    const state = ownershipState(before.owner);
    if (state.kind !== 'gone') return state;
  }
  if (before.kind === 'owner' && before.owner.tool === 'rollout') {
    const mutated = await lstat(join(path, 'mutation.json'))
      .then(() => true)
      .catch((error) => {
        if (errno(error, 'ENOENT')) return false;
        throw error;
      });
    if (mutated)
      throw new Error(
        'Interrupted SDK rollout; admission remains closed. Run its backed-up rollback.sh before admitting work.'
      );
  }
  if (
    before.kind === 'missing' &&
    Date.now() - (await stat(path)).mtimeMs <= initializationGrace
  )
    return;
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(join(path, 'reclaim'), 'wx', 0o600);
  } catch (error) {
    if (errno(error, 'EEXIST')) {
      const guard = await stat(join(path, 'reclaim'));
      if (Date.now() - guard.mtimeMs > initializationGrace)
        throw new Error(
          'Admission reclaim guard has no verifiable owner. Admission is closed; inspect it under exclusive idle recovery custody before repairing the recorded directory.'
        );
      return;
    }
    if (errno(error, 'ENOENT')) return;
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
// Legacy schedulers reject unknown slot names, even after all owners drain.
// Keep this marker across config changes; downgrades require an idle migration.
export const budgetFence = 'budget-v3';
async function validBudgetFence(path: string) {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW
    );
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size !== 2 ||
      (await file.readFile('utf8')) !== '3\n'
    )
      throw new Error(
        'Malformed budget compatibility fence; admission is closed.'
      );
    return true;
  } catch (error) {
    if (errno(error, 'ENOENT')) return false;
    throw error;
  } finally {
    await file?.close();
  }
}
async function publishBudgetFence(home: string) {
  // The admission lock is held: no live publisher can own one of these stages.
  for (const name of await readdir(home)) {
    if (/^budget-fence\..+\.tmp$/u.test(name))
      await rm(join(home, name), { force: true });
  }
  const slots = join(home, 'slots');
  const target = join(slots, budgetFence);
  if (await validBudgetFence(target)) return;
  await assertBudgetLaunchers(home);
  await mkdir(slots, { recursive: true, mode: 0o700 });
  const staged = join(home, `budget-fence.${randomUUID()}.tmp`);
  try {
    const file = await open(staged, 'wx', 0o600);
    try {
      await file.writeFile('3\n');
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(staged, target);
      process.stderr.write(
        '[ttr resources] Published budget protocol 3. ttr 0.28.0 and old shims are now incompatible ("Unknown resource slot"). Upgrade every global CLI and refresh shims with setup using the existing roots. Idle rollback requires stopping all new clients and removing slots/budget-v3 per the runbook.\n'
      );
    } catch (error) {
      if (!errno(error, 'EEXIST')) throw error;
      if (!(await validBudgetFence(target)))
        throw new Error(
          'Budget compatibility fence disappeared; admission is closed.'
        );
    }
  } finally {
    await rm(staged, { force: true });
  }
}

export async function withAdmission<T>(
  home: string,
  action: () => Promise<T>,
  cancelled = () => false,
  purpose: 'admission' | 'setup' = 'admission'
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
  const verificationDeadline = Date.now() + initializationGrace;
  try {
    while (!acquired) {
      if (cancelled()) return undefined;
      try {
        await mkdir(path, { mode: 0o700 });
      } catch (error) {
        if (!errno(error, 'EEXIST')) throw error;
        const holder = await reclaimMutex(path).catch((error) => {
          if (!errno(error, 'ENOENT')) throw error;
        });
        if (holder?.kind === 'unknown' && Date.now() >= verificationDeadline)
          throw new Error(
            'Admission mutex process identity is unavailable. Admission is closed; restore trusted process inspection or use the documented exclusive idle recovery procedure.'
          );
        await sleep(250);
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
    if (purpose === 'admission') {
      await publishOwnershipFence(home);
      await publishBudgetFence(home);
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
      owner.ownershipVersion === 1 &&
      originalProcessAlive(owner.pid, owner.pidStart) &&
      processLineage(true)?.pids.has(owner.pid)
  );
}

async function releaseMutex(path: string, token: string) {
  const deadline = Date.now() + initializationGrace;
  // Normal release uses the same exclusive removal marker as stale reclaim.
  // A stale observer cannot remove a newly initializing replacement directory.
  for (;;) {
    try {
      const removal = await open(join(path, 'reclaim'), 'wx', 0o600);
      await removal.close();
      break;
    } catch (error) {
      if (!errno(error, 'EEXIST')) throw error;
      if (Date.now() >= deadline)
        throw new Error(
          'Admission release guard could not be verified. Ownership was retained; inspect the mutex under exclusive idle recovery custody.'
        );
      await sleep(25);
    }
  }
  const current = await readOwner(join(path, 'owner.json'));
  if (current?.token === token) await rm(path, { recursive: true });
  else await rm(join(path, 'reclaim'), { force: true });
}
export async function occupancy(
  home: string,
  reclaim = false,
  configured?: ResourceConfig,
  inspect = processInspection()
) {
  const config = configured ?? (await readResourceConfig(home));
  const maxLanes = config ? resourceMaxLanes(config) : 1;
  const slots = join(home, 'slots');
  const names: string[] = await readdir(slots).catch((error) => {
    if (errno(error, 'ENOENT')) return [];
    throw error;
  });
  if (names.includes(ownershipFence))
    await validOwnershipFence(join(slots, ownershipFence));
  if (
    names.includes(budgetFence) &&
    (await readFile(join(slots, budgetFence), 'utf8')) !== '3\n'
  )
    throw new Error(
      'Malformed budget compatibility fence; admission is closed.'
    );
  if (
    names
      .filter((name) => name !== budgetFence && name !== ownershipFence)
      .some(
        (name) => !/^(0|[1-9]|1[0-5])$/.test(name) || Number(name) >= maxLanes
      )
  )
    throw new Error(
      'Unknown resource slot; admission is closed. A compatibility marker requires a newer ttr: upgrade the global CLI and refresh shims with ttr resources setup using the existing roots. For rollback, first drain all work and follow the resource budget rollback runbook.'
    );
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
    if (state.kind === 'owner' && ownerAlive(state.owner, inspect())) {
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
          (state.kind !== 'owner' || current.owner.token !== state.owner.token))
      )
        throw new Error('Resource ownership changed during reclaim.');
      if (current.kind === 'owner' && ownerAlive(current.owner)) {
        owners.push(current.owner);
        ownerSlots.push(path);
        occupied.push(path);
        if (path === join(home, 'lock')) legacy = true;
        continue;
      }
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
export async function tickets(
  home: string,
  prune = false,
  inspect = processInspection()
) {
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
    if (ownerAlive(state.owner, inspect()))
      live.push({ path, owner: state.owner });
    else if (prune) {
      const current = await readOwner(path);
      if (current?.token === state.owner.token) {
        if (ownerAlive(current)) live.push({ path, owner: current });
        else await rm(path, { force: true });
      }
    }
  }
  return live;
}
const ignoredMarkers = new Set<string>();
// An admitted job exports its owner token. A marker counts only while it names
// a live owner inside that owner's process tree, so stale or copied markers
// cannot bypass admission. Without process-tree evidence the marker is not
// trusted and the command queues. Ancestry alone still covers children whose
// environment was filtered (Turbo strict).
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
  if (evidence) {
    const snapshot = snapshotProcesses();
    if (marked && descendsFrom(marked, evidence, snapshot)) return marked;
    const related = state.owners.find((owner) =>
      descendsFrom(owner, evidence, snapshot)
    );
    if (related) return related;
  }
  if (marker && !ignoredMarkers.has(marker)) {
    ignoredMarkers.add(marker);
    process.stderr.write(
      evidence || !marked
        ? `[ttr resources] ignoring ${admittedMarker}: it does not belong to a live admitted job in this process tree; queueing normally.\n`
        : `[ttr resources] ignoring ${admittedMarker}: the process tree could not be read (ps failed), so the marker cannot be verified; queueing normally.\n`
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

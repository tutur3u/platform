import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { constants, setPriority } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { startActivitySampler } from './resources-activity';
import {
  admissionResourceConfig,
  burstEligibility,
} from './resources-adaptive';
import {
  budgetStatus,
  selectBudgetTicket,
  ticketDemand,
} from './resources-budget';
import { limitCommand } from './resources-command';
import {
  atomicJson,
  defaultResourceConfig,
  effectiveResourceLanes,
  laneResourceConfig,
  type ResourceConfig,
  readResourceConfig,
  resourceLanes,
  resourceMaxLanes,
  resourcePolicyKey,
  type ValidationLanes,
} from './resources-config';
import { memoryPressure } from './resources-diagnostics';
import { diskGate } from './resources-disk-gate';
import {
  admittedMarker,
  nestedOwner,
  newOwner,
  occupancy,
  processGroupAlive,
  processLineage,
  type ResourceOwner,
  readOwner,
  releaseSlot,
  tickets,
  withAdmission,
} from './resources-slots';

export {
  isAncestor,
  processAlive,
  type ResourceOwner,
  readOwner,
} from './resources-slots';

export async function resourceQueueStatus(
  home: string,
  laneCount: ValidationLanes = 1,
  configured?: ResourceConfig
) {
  const config =
    configured ?? ((await readResourceConfig(home)) || defaultResourceConfig());
  const baseLanes = resourceLanes(config);
  const maxLanes = resourceMaxLanes(config);
  const state = await occupancy(home, false, configured);
  const burst =
    maxLanes === baseLanes
      ? { eligible: false, reason: 'Burst lanes are not configured' }
      : state.occupied.length >= effectiveResourceLanes(config)
        ? {
            eligible: false,
            reason: 'Burst lanes are full or above the host lane ceiling',
          }
        : await burstEligibility(config);
  const waiting = (await tickets(home)).map((ticket) => ticket.owner);
  return {
    // Budget ceiling, total use, and per-project share, use, borrowing and
    // waiters, when a cross-project budget is configured.
    ...(config.budget
      ? { budget: budgetStatus(config.budget, state.owners, waiting) }
      : {}),
    owners: state.owners,
    ownerSlots: state.ownerSlots,
    laneCount,
    baseLanes,
    maxLanes,
    effectiveLanes: effectiveResourceLanes(config),
    burst,
    // Preserve the old field without representing multiple owners as idle.
    owner: state.owners[0] ?? null,
    occupied: state.occupied.length,
    waiting,
  };
}
function signalChild(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    /* The owned group has exited. */
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
    // An owned group waits on fd 3 until its PID receipt is durable. If the
    // broker dies first, EOF closes the gate without launching the workload.
    const launcher = `const fs=require('node:fs');const cp=require('node:child_process');let started=false;
      for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{if(!started)process.exit(signal==='SIGINT'?130:signal==='SIGHUP'?129:143)});
      const gate=fs.createReadStream(null,{fd:3});
      gate.once('data',()=>{started=true;gate.destroy();const child=cp.spawn(${JSON.stringify(command)},${JSON.stringify(args)},{env:process.env,stdio:'inherit',shell:false});
        child.once('error',()=>process.exit(1));child.once('exit',(code,signal)=>process.exit(code??(signal==='SIGINT'?130:signal==='SIGHUP'?129:143)));});
      gate.once('end',()=>{if(!started)process.exit(143)});`;
    const child = owned
      ? spawn(process.execPath, ['-e', launcher], {
          env,
          shell: false,
          stdio: ['inherit', 'inherit', 'inherit', 'pipe'],
          detached: true,
        })
      : spawn(command, args, { env, shell: false, stdio: 'inherit' });
    const gate = owned ? child.stdio[3] : undefined;
    if (gate)
      gate.on('error', () => {
        /* A cancelled launcher closes its gate. */
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
        const handler = handlers[i];
        if (handler) process.removeListener(signal, handler);
      });
    let receipt: Promise<unknown> = Promise.resolve();
    child.once('spawn', () => {
      if (owned && child.pid) {
        try {
          setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
        } catch {
          /* Advisory priority. */
        }
      }
      receipt = (child.pid && onSpawn ? onSpawn(child.pid) : Promise.resolve())
        .then(() => {
          if (gate instanceof Writable) gate.end('launch');
        })
        .catch((error) => {
          if (child.pid && owned) signalChild(child.pid, 'SIGTERM');
          throw error;
        });
      // Handle immediately; report errors only after the owned group drains.
      void receipt.catch(() => {});
    });
    child.once('error', (error) => {
      clean();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      void (async () => {
        try {
          if (owned && child.pid)
            while (processGroupAlive(child.pid)) await sleep(25);
          await receipt;
          resolve(
            code ??
              (signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143)
          );
        } catch (error) {
          reject(error);
        } finally {
          clean();
        }
      })();
    });
  });
}
export function commandSummary(command: string, args: string[]) {
  const text = [command.split('/').pop() || command, ...args].join(' ');
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}
// The ancestor was admitted under its recorded limits; re-validating the host
// budget here would reject nested work on a smaller or busier host.
async function runNested(
  home: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  parent: ResourceOwner,
  onSpawn?: (pid: number) => Promise<void>
) {
  const inherited = parent.limits
    ? {
        VITEST_MAX_WORKERS: String(parent.limits.vitestWorkers),
        CARGO_BUILD_JOBS: String(parent.limits.buildJobs),
        TURBO_CONCURRENCY: '1',
      }
    : {};
  const config = (await readResourceConfig(home)) || defaultResourceConfig();
  const caps = parent.limits
    ? { ...config, turboConcurrency: 1 }
    : laneResourceConfig(config);
  return spawnResourceCommand(
    command,
    limitCommand(command, args, { ...caps, ...parent.limits }),
    { ...env, ...inherited, [admittedMarker]: parent.token },
    false,
    onSpawn
  );
}
// The ticket that may claim the next lane: the FIFO head, or under a budget
// the per-project head chosen by share, borrowing and fit.
function chooseTicket(
  config: ResourceConfig,
  live: { path: string; owner: ResourceOwner }[],
  owners: ResourceOwner[]
) {
  if (!config.budget) return live[0]?.path;
  return selectBudgetTicket(
    config.budget,
    live.map((entry) => ({
      path: entry.path,
      queuedAt: entry.owner.queuedAt,
      demand: entry.owner.demand,
      limits: entry.owner.limits,
    })),
    owners
  ).selected?.path;
}
// Read-only preview outside the mutex, so only the next ticket probes disk.
async function nextTicket(home: string) {
  const config = (await readResourceConfig(home)) || defaultResourceConfig();
  return chooseTicket(
    config,
    await tickets(home),
    (await occupancy(home)).owners
  );
}
// How long a waiter with an unverifiable ancestor marker waits before failing.
export const ancestryWait = { ms: 60_000 };
export async function queuedResourceCommand(
  home: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  ignorePressure = false,
  lanes: ValidationLanes = 1,
  pressureProbe: typeof memoryPressure = memoryPressure,
  burstProbe: typeof burstEligibility = burstEligibility,
  diskCheck: typeof diskGate = diskGate,
  onSpawn?: (pid: number) => Promise<void>
) {
  if (process.platform === 'win32')
    throw new Error('Resource admission currently supports macOS and Linux.');
  const originalArgs = [...args];
  const parent = await nestedOwner(home);
  if (parent)
    return runNested(home, command, originalArgs, env, parent, onSpawn);
  const owner = newOwner(
    command.split('/').pop() || command,
    commandSummary(command, originalArgs)
  );
  const ticket = join(home, 'queue', `${Date.now()}-${owner.token}.json`);
  let slot: string | undefined;
  let stopSampler: (() => Promise<void>) | undefined;
  let launchArgs = originalArgs;
  const signalCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  const waiting = new AbortController();
  let cancelled: keyof typeof signalCodes | undefined;
  const cancelInt = () => {
    cancelled = 'SIGINT';
    waiting.abort();
  };
  const cancelTerm = () => {
    cancelled = 'SIGTERM';
    waiting.abort();
  };
  const cancelHup = () => {
    cancelled = 'SIGHUP';
    waiting.abort();
  };
  process.on('SIGINT', cancelInt);
  process.on('SIGTERM', cancelTerm);
  process.on('SIGHUP', cancelHup);
  try {
    await withAdmission(
      home,
      async () => {
        // Declare budget demand once, at enqueue, from the classified tool
        // or an explicit TTR_RESOURCES_TOKENS / TTR_RESOURCES_MEMORY_GIB.
        const config = await readResourceConfig(home);
        if (config?.budget)
          owner.demand = ticketDemand(config.budget, {
            cwd: process.cwd(),
            command,
            args: originalArgs,
            defaults: config,
            env,
          });
        await atomicJson(ticket, owner);
      },
      () => Boolean(cancelled)
    );
    let announced = 0;
    let pressureReason: string | null = null;
    let ancestryCheckedAt = Date.now();
    let unverifiedSince: number | undefined;
    while (!slot) {
      if (cancelled) return signalCodes[cancelled];
      // Safety net: a waiter must never queue behind its own ancestor, even if
      // the first ancestry probe failed. Confirm with a fresh process snapshot.
      if (Date.now() - ancestryCheckedAt >= 1_000) {
        ancestryCheckedAt = Date.now();
        const ancestor = await nestedOwner(home)
          .then((found) => found && nestedOwner(home, process.env, true))
          .catch(() => undefined);
        if (ancestor) {
          process.stderr.write(
            `[ttr resources] PID ${process.pid} descends from admitted PID ${ancestor.pid}; running without re-queueing\n`
          );
          // Leave the FIFO first so siblings are not held behind this ticket.
          if ((await readOwner(ticket))?.token === owner.token)
            await rm(ticket, { force: true });
          return await runNested(home, command, originalArgs, env, ancestor);
        }
        // Without any ancestry evidence, a waiter carrying a live owner's
        // marker may be queued behind its own ancestor forever: fail with an
        // actionable error after a bounded wait instead of deadlocking.
        const marker =
          process.env[admittedMarker] || process.env.TTR_RESOURCE_OWNER;
        const unverified =
          marker !== undefined &&
          !processLineage(true) &&
          (await occupancy(home)).owners.some(
            (entry) => entry.token === marker
          );
        if (!unverified) unverifiedSince = undefined;
        else unverifiedSince ??= Date.now();
        if (
          unverifiedSince !== undefined &&
          Date.now() - unverifiedSince >= ancestryWait.ms
        )
          throw new Error(
            `Cannot verify process ancestry: neither /bin/ps nor /usr/bin/ps exists${process.platform === 'linux' ? ' and /proc is unreadable' : ''}. This command carries ${admittedMarker} for a live admitted job and may be waiting behind its own ancestor. Install ps (procps), or rerun the nested command with TTR_RESOURCES_BYPASS=1.`
          );
      }
      let pressureBlocked = false;
      pressureReason = null;
      let diskReason: string | null = null;
      // Dequeue-time disk check, bounded and taken outside the admission
      // mutex so a hung volume cannot stall other admissions. Only the FIFO
      // head probes; a round without a fresh result never claims.
      const disk =
        (await nextTicket(home)) === ticket
          ? await diskCheck(process.cwd(), env)
          : undefined;
      slot = await withAdmission(
        home,
        async () => {
          const config =
            (await readResourceConfig(home)) || defaultResourceConfig();
          if (resourceLanes(config) !== lanes)
            throw new Error(
              'Resource lane configuration changed; retry with current settings.'
            );
          const policy = resourcePolicyKey(config);
          laneResourceConfig(config);
          const maxLanes = effectiveResourceLanes(config);
          const live = await tickets(home, true);
          const state = await occupancy(home, true);
          if (
            state.legacy ||
            state.initializing ||
            live.some((ticket) => ticket.owner.scheduler !== 2) ||
            chooseTicket(config, live, state.owners) !== ticket ||
            state.occupied.length >= maxLanes
          )
            return undefined;
          const pressure = ignorePressure
            ? { blocked: false, reason: null }
            : await pressureProbe();
          pressureReason = pressure.reason;
          pressureBlocked = pressure.blocked;
          if (pressure.blocked || cancelled) return undefined;
          const burst =
            state.occupied.length >= lanes
              ? await burstProbe(config)
              : undefined;
          if (burst && !burst.eligible) {
            pressureBlocked = true;
            pressureReason = burst.reason;
            return undefined;
          }
          if (cancelled) return undefined;
          // Pressure probing is asynchronous. Recheck occupancy and policy before claim.
          const latest =
            (await readResourceConfig(home)) || defaultResourceConfig();
          if (resourcePolicyKey(latest) !== policy)
            throw new Error(
              'Resource worker policy changed during admission; retry with current settings.'
            );
          const current = await occupancy(home, true);
          const currentTickets = await tickets(home, true);
          if (
            current.legacy ||
            current.initializing ||
            current.occupied.length >= maxLanes ||
            chooseTicket(latest, currentTickets, current.owners) !== ticket ||
            currentTickets.some((ticket) => ticket.owner.scheduler !== 2) ||
            (current.occupied.length >= lanes && !burst?.eligible)
          )
            return undefined;
          // Headroom seen at enqueue may be gone after a long wait, and an
          // unreadable volume fails closed.
          if (!disk) return undefined;
          if (!disk.admit) {
            pressureBlocked = true;
            diskReason = disk.reason;
            return undefined;
          }
          if (cancelled) return undefined;
          // Under a budget the declared tokens are the job's worker caps (its
          // whole fan-out); otherwise lanes split the configured totals.
          const caps =
            config.budget && owner.demand
              ? {
                  ...laneResourceConfig(config),
                  vitestWorkers: owner.demand.tokens,
                  buildJobs: owner.demand.tokens,
                }
              : maxLanes > lanes
                ? admissionResourceConfig(config, current.owners)
                : laneResourceConfig(config);
          if (!caps) return undefined;
          launchArgs = limitCommand(command, originalArgs, caps);
          owner.limits = {
            vitestWorkers: caps.vitestWorkers,
            buildJobs: caps.buildJobs,
          };
          const path = Array.from({ length: maxLanes }, (_, i) =>
            join(home, 'slots', String(i))
          ).find((path) => !current.occupied.includes(path));
          if (!path) return undefined;
          await mkdir(join(home, 'slots'), { recursive: true, mode: 0o700 });
          await mkdir(path, { mode: 0o700 });
          owner.startedAt = new Date().toISOString();
          // Record the claim for cleanup even if writing metadata fails.
          slot = path;
          await atomicJson(join(path, 'owner.json'), owner);
          await rm(ticket, { force: true });
          return path;
        },
        () => Boolean(cancelled)
      );
      if (!slot) {
        if (Date.now() - announced > 30_000) {
          process.stderr.write(
            diskReason
              ? `[ttr resources] queued PID ${process.pid}; blockedBy=disk: ${diskReason}\n`
              : pressureReason
                ? `[ttr resources] queued PID ${process.pid}; blockedBy=pressure: ${pressureReason}\n`
                : `[ttr resources] queued PID ${process.pid}; blockedBy=local_saturated: waiting for the shared validation slots. Tip: --offload auto runs the pushed commit on a trusted devbox runner.\n`
          );
          announced = Date.now();
        }
        // Backoff never holds admission, and cancellation remains responsive.
        await sleep(pressureBlocked ? 5_000 : 50, undefined, {
          signal: waiting.signal,
        }).catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError'))
            throw error;
        });
      }
    }
    if (cancelled) return signalCodes[cancelled];
    process.stderr.write(`[ttr resources] running PID ${process.pid}\n`);
    const ownedSlot = slot;
    const code = await spawnResourceCommand(
      command,
      launchArgs,
      {
        ...env,
        TTR_RESOURCE_OWNER: owner.token,
        [admittedMarker]: owner.token,
        TURBO_CONCURRENCY: '1',
        VITEST_MAX_WORKERS: String(owner.limits?.vitestWorkers),
        CARGO_BUILD_JOBS: String(owner.limits?.buildJobs),
      },
      true,
      async (pid) => {
        owner.childPid = pid;
        await withAdmission(home, async () => {
          if (
            (await readOwner(join(ownedSlot, 'owner.json')))?.token !==
            owner.token
          )
            throw new Error(
              'Owned resource slot changed before child receipt.'
            );
          await atomicJson(join(ownedSlot, 'owner.json'), owner);
        });
        stopSampler = startActivitySampler(ownedSlot, owner);
        if (cancelled) signalChild(pid, cancelled);
        else await onSpawn?.(pid);
      }
    );
    process.stderr.write(`[ttr resources] finished; exit ${code}\n`);
    return cancelled ? signalCodes[cancelled] : code;
  } finally {
    process.removeListener('SIGINT', cancelInt);
    process.removeListener('SIGTERM', cancelTerm);
    process.removeListener('SIGHUP', cancelHup);
    await stopSampler?.();
    // Ticket names are private UUIDs. A cancelled broker must also be able to
    // remove its own ticket while an unrelated initializing mutex blocks admission.
    if ((await readOwner(ticket))?.token === owner.token)
      await rm(ticket, { force: true });
    if (slot) await releaseSlot(home, slot, owner.token);
  }
}
export async function hasResourceOwner(home: string) {
  return Boolean(await nestedOwner(home));
}

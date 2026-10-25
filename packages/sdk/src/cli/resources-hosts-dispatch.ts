import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import { gitEntry } from './resources-budget';
import { commandCwd } from './resources-command';
import {
  type DiskGate,
  diskGate,
  probeDiskWithTimeout,
} from './resources-disk-gate';
import {
  type HostRegistry,
  type HostSpec,
  type JobClass,
  readHostRegistry,
} from './resources-hosts-config';
import {
  admitHostTicket,
  enqueueHostTicket,
  type HostReservation,
  type HostTelemetry,
  type HostTicket,
  hostReservationMarker,
  nestedHostReservation,
  previewHostTicket,
  releaseHostReservation,
  remoteDispatchBlocker,
  removeHostTicket,
  updateHostReservation,
} from './resources-hosts-ledger';
import { canEverHold } from './resources-hosts-plan';
import type { HostProbe } from './resources-hosts-probe';
import {
  assertHostsHub,
  assertNestedHostRequirements,
  type HostCapability,
  hostsRequirements,
} from './resources-hosts-requirements';
import { commandSummary } from './resources-queue';

// Fairness is per repository: linked worktrees of one repository (for
// example every Upskii worktree) share one project identity.
export function projectIdentity(cwd: string) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const git = join(dir, '.git');
    try {
      const text = gitEntry(git);
      if (text === undefined) return git;
      const pointer = /^gitdir:\s*(.+)$/mu.exec(text);
      if (pointer) {
        const gitdir = resolve(dir, pointer[1]!.trim());
        try {
          return resolve(
            gitdir,
            readFileSync(join(gitdir, 'commondir'), 'utf8').trim()
          );
        } catch {
          return gitdir;
        }
      }
    } catch {
      /* Not a repository root; keep walking up. */
    }
    if (dir === dirname(dir)) return resolve(cwd);
  }
}

export interface HostDispatchDeps {
  // Fleet snapshot from the devbox control plane, or undefined if unreachable.
  fleet: () => Promise<DevboxFleetSnapshot | undefined>;
  probeHosts?: (registry: HostRegistry) => Promise<Record<string, HostProbe>>;
  // Exact pushed commit for remote runs, or undefined when the tree is dirty
  // or unpushed (the job is then local-only).
  commitPlan: (
    cwd: string
  ) => Promise<{ sha: string; prefix: string } | undefined>;
  runLocal: (input: {
    host: HostSpec;
    jobClass: JobClass;
    reservation: HostReservation;
    // Exported to the job so nested `run --hosts` reuses this reservation.
    marker: Record<string, string>;
    onChild: (pid: number) => Promise<void>;
  }) => Promise<number>;
  // Reuses #6454's offload transport; `rejected` means no remote run exists.
  runRemote: (input: {
    host: HostSpec;
    jobClass: JobClass;
    sha: string;
    prefix: string;
    operationId: string;
  }) => Promise<number | { rejected: true; reason: string }>;
  localDiskFreeGiB?: (cwd: string) => Promise<number | undefined>;
  // Dequeue-time gate for local light work (heavy work passes the lane gate).
  localDiskGate?: (cwd: string) => Promise<DiskGate>;
  pollMs?: number;
  log?: (text: string) => void;
}
const defaultDisk = async (cwd: string) =>
  probeDiskWithTimeout(cwd)
    .then((probe) => probe.freeBytes / 1024 ** 3)
    .catch(() => undefined);

/**
 * Admits one job across the registered hosts and runs it on the assigned
 * host. The reservation is held until the job ends and is released on
 * success, failure, cancellation (SIGINT/SIGTERM/SIGHUP) or, if this broker
 * dies, by liveness pruning in the next admission round. Remote dispatch
 * re-checks the runner and the commit plan immediately before creation and
 * requeues instead of dispatching when either changed.
 */
export async function hostsRun({
  home,
  command,
  args,
  jobClass,
  requires = hostsRequirements(command, args),
  cwd = commandCwd(args),
  env = process.env,
  registry,
  deps,
  auto = false,
  dryRun = false,
}: {
  home: string;
  command: string;
  args: string[];
  jobClass: JobClass;
  requires?: HostCapability[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  registry?: HostRegistry;
  deps: HostDispatchDeps;
  auto?: boolean;
  dryRun?: boolean;
}) {
  const log =
    deps.log ??
    ((text: string) => process.stderr.write(`[ttr resources] ${text}\n`));
  const hosts = registry ?? (await readHostRegistry(home));
  if (!hosts)
    throw new Error(
      'No hosts.json in the resources home; multi-host admission is not configured.'
    );
  assertHostsHub(hosts);
  // Nested inside an admitted hosts job: run under the ancestor's
  // reservation rather than queueing behind it.
  const parent = await nestedHostReservation(home, env, true);
  if (parent && dryRun)
    throw new Error('Run placement dry-run outside an admitted hosts job.');
  if (parent) {
    const host = hosts.hosts.find((entry) => entry.id === parent.hostId);
    if (host?.kind === 'local') {
      assertNestedHostRequirements(hosts, requires);
      log(
        `PID ${process.pid} runs under ancestor reservation ${parent.token.slice(0, 8)}`
      );
      return await deps.runLocal({
        host,
        jobClass: parent.jobClass,
        reservation: parent,
        marker: { [hostReservationMarker]: parent.token },
        onChild: async () => {},
      });
    }
  }
  const remoteHosts = hosts.hosts.some((host) => host.kind === 'runner');
  const plan = remoteHosts ? await deps.commitPlan(cwd) : undefined;
  const ticket: HostTicket = {
    token: randomUUID(),
    pid: process.pid,
    project: projectIdentity(cwd),
    jobClass,
    queuedAt: Date.now(),
    bypassed: 0,
    remoteOk: Boolean(plan),
    requires,
    ...(auto ? { placement: 'auto' as const } : {}),
    command: commandSummary(command, args),
  };
  if (!canEverHold(hosts, ticket))
    throw new Error(
      `No registered host can ever run a ${jobClass} job${plan ? '' : ' from this tree (remote runs need a clean, pushed commit)'}; check hosts.json capabilities, platforms, slots and weights.`
    );
  const unavailableProbes: Record<string, HostProbe> = {};
  const probeHosts = async () => {
    if (!auto || !deps.probeHosts) return undefined;
    const current = await deps.probeHosts({
      ...hosts,
      hosts: hosts.hosts.filter((host) => !unavailableProbes[host.id]),
    });
    for (const [id, probe] of Object.entries(current))
      if (!probe.healthy) unavailableProbes[id] = probe;
    return { ...current, ...unavailableProbes };
  };
  const telemetry = async (): Promise<HostTelemetry> => ({
    probes: await probeHosts(),
    localDiskFreeGiB: await (deps.localDiskFreeGiB ?? defaultDisk)(cwd),
    snapshot: remoteHosts
      ? await deps.fleet().catch(() => undefined)
      : undefined,
  });
  if (dryRun) {
    const result = await previewHostTicket(
      home,
      ticket,
      hosts,
      await telemetry()
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.hostId || result.queue ? 0 : 75;
  }
  const signalCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
  let cancelled: keyof typeof signalCodes | undefined;
  let remoteRunning = false;
  const waiting = new AbortController();
  const handlers = (
    Object.keys(signalCodes) as (keyof typeof signalCodes)[]
  ).map((signal) => {
    const handler = () => {
      cancelled ??= signal;
      waiting.abort();
      // The offload transport stops its remote run on SIGINT/SIGTERM only;
      // forward a hangup so a closed terminal also stops the remote run.
      if (signal === 'SIGHUP' && remoteRunning)
        process.kill(process.pid, 'SIGTERM');
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  let reservation: HostReservation | undefined;
  const requeue = async (reason: string, localOnly: boolean) => {
    log(reason);
    if (reservation) await releaseHostReservation(home, reservation);
    reservation = undefined;
    if (localOnly) {
      ticket.remoteOk = false;
      if (!canEverHold(hosts, ticket))
        throw new Error(
          `No local host can run this ${jobClass} job after remote dispatch was refused.`
        );
    }
  };
  let attempts = 0;
  try {
    for (;;) {
      if (auto && attempts++ >= 3) {
        log(
          'automatic placement stopped after repeated eligibility changes; no new run dispatched'
        );
        return 75;
      }
      await enqueueHostTicket(home, ticket);
      let announced = 0;
      while (!reservation) {
        if (cancelled) return signalCodes[cancelled];
        const observation = await telemetry();
        if (cancelled) return signalCodes[cancelled];
        const result = await admitHostTicket(home, ticket, hosts, observation);
        if (result.admitted) {
          reservation = result.reservation;
          ticket.bypassed = result.ticket.bypassed;
          break;
        }
        if (auto) {
          const explanation = await previewHostTicket(
            home,
            ticket,
            hosts,
            observation
          );
          if (!explanation.queue && !explanation.hostId) {
            log(`automatic placement refused: ${result.reason}`);
            return 75;
          }
          if (Date.now() - announced > 30_000 && explanation.queue)
            log(
              `all eligible hosts full; queue target ${explanation.queue.hostId}, estimated wait ${explanation.queue.expectedWaitSeconds}s; ${result.reason}`
            );
        }
        if (Date.now() - announced > 30_000) {
          log(
            `queued ${jobClass} PID ${process.pid} across hosts; blockedBy: ${result.reason}`
          );
          announced = Date.now();
        }
        await sleep(deps.pollMs ?? (auto ? 5_000 : 1_000), undefined, {
          signal: waiting.signal,
        }).catch(() => undefined);
      }
      const held: HostReservation = reservation;
      const host = hosts.hosts.find((entry) => entry.id === held.hostId)!;
      if (host.kind === 'local') {
        if (jobClass === 'light') {
          const disk = await (
            deps.localDiskGate ?? ((path) => diskGate(path, env))
          )(cwd);
          if (!disk.admit) {
            await requeue(
              `queued light PID ${process.pid}; blockedBy=disk: ${disk.reason}`,
              false
            );
            await sleep(deps.pollMs ?? 5_000, undefined, {
              signal: waiting.signal,
            }).catch(() => undefined);
            continue;
          }
        }
        log(
          `admitted ${jobClass} PID ${process.pid} on host ${host.id}${auto ? (host.kind === 'local' ? ' (local fallback: no remote host eligible)' : ' (automatic placement: free lane in Thanh, Sonha, Linux, local order)') : ''}`
        );
        return await deps.runLocal({
          host,
          jobClass,
          reservation: held,
          marker: { [hostReservationMarker]: held.token },
          onChild: async (pid) => {
            held.childPid = pid;
            await updateHostReservation(home, held);
          },
        });
      }
      // Admission used telemetry from before the ticket won: re-check the
      // runner against a fresh server-timestamped snapshot, and the commit
      // plan, right before creating the remote run.
      const blocker = remoteDispatchBlocker(
        hosts,
        host.id,
        await deps.fleet().catch(() => undefined),
        ticket.requires,
        await probeHosts()
      );
      if (blocker) {
        await requeue(
          `host ${host.id} is no longer eligible (${blocker}); requeueing without dispatch`,
          false
        );
        continue;
      }
      const current = await deps.commitPlan(cwd);
      if (current?.sha !== plan!.sha || current.prefix !== plan!.prefix) {
        await requeue(
          'the commit plan changed since admission; requeueing for local hosts',
          true
        );
        continue;
      }
      if (cancelled) return signalCodes[cancelled];
      log(
        `admitted ${jobClass} PID ${process.pid} on host ${host.id}${auto ? ' (automatic placement: free lane in Thanh, Sonha, Linux, local order)' : ''}`
      );
      remoteRunning = true;
      const outcome = await deps
        .runRemote({
          host,
          jobClass,
          sha: current.sha,
          prefix: current.prefix,
          operationId: held.token,
        })
        .finally(() => {
          remoteRunning = false;
        });
      if (typeof outcome === 'number') return outcome;
      // The runner refused creation, so no remote run exists: requeue the job
      // for local hosts only instead of failing or running twice.
      await requeue(
        `host ${host.id} refused the run (${outcome.reason}); requeueing for local hosts`,
        true
      );
    }
  } finally {
    for (const [signal, handler] of handlers)
      process.removeListener(signal, handler);
    await removeHostTicket(home, ticket);
    if (reservation) await releaseHostReservation(home, reservation);
  }
}

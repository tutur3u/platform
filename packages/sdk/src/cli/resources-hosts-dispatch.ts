import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
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
  releaseHostReservation,
  remoteDispatchBlocker,
  removeHostTicket,
  updateHostReservation,
} from './resources-hosts-ledger';
import { canEverHold } from './resources-hosts-plan';
import { commandSummary } from './resources-queue';

// Fairness is per repository: linked worktrees of one repository (for
// example every Upskii worktree) share one project identity.
export function projectIdentity(cwd: string) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const git = join(dir, '.git');
    try {
      if (statSync(git).isDirectory()) return git;
      const pointer = /^gitdir:\s*(.+)$/mu.exec(readFileSync(git, 'utf8'));
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
  cwd = commandCwd(args),
  env = process.env,
  registry,
  deps,
}: {
  home: string;
  command: string;
  args: string[];
  jobClass: JobClass;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  registry?: HostRegistry;
  deps: HostDispatchDeps;
}) {
  const log =
    deps.log ??
    ((text: string) => process.stderr.write(`[ttr resources] ${text}\n`));
  const hosts = registry ?? (await readHostRegistry(home));
  if (!hosts)
    throw new Error(
      'No hosts.json in the resources home; multi-host admission is not configured.'
    );
  // Nested inside an admitted hosts job: run under the ancestor's
  // reservation rather than queueing behind it.
  const parent = await nestedHostReservation(home, env, true);
  if (parent) {
    const host = hosts.hosts.find((entry) => entry.id === parent.hostId);
    if (host?.kind === 'local') {
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
    command: commandSummary(command, args),
  };
  if (!canEverHold(hosts, ticket))
    throw new Error(
      `No registered host can ever run a ${jobClass} job${plan ? '' : ' from this tree (remote runs need a clean, pushed commit)'}; check hosts.json slots and weights.`
    );
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
  try {
    for (;;) {
      await enqueueHostTicket(home, ticket);
      let announced = 0;
      while (!reservation) {
        if (cancelled) return signalCodes[cancelled];
        const telemetry: HostTelemetry = {
          localDiskFreeGiB: await (deps.localDiskFreeGiB ?? defaultDisk)(cwd),
          snapshot: remoteHosts
            ? await deps.fleet().catch(() => undefined)
            : undefined,
        };
        if (cancelled) return signalCodes[cancelled];
        const result = await admitHostTicket(home, ticket, hosts, telemetry);
        if (result.admitted) {
          reservation = result.reservation;
          break;
        }
        if (Date.now() - announced > 30_000) {
          log(
            `queued ${jobClass} PID ${process.pid} across hosts; blockedBy: ${result.reason}`
          );
          announced = Date.now();
        }
        await sleep(deps.pollMs ?? 1_000, undefined, {
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
        log(`admitted ${jobClass} PID ${process.pid} on host ${host.id}`);
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
        await deps.fleet().catch(() => undefined)
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
      log(`admitted ${jobClass} PID ${process.pid} on host ${host.id}`);
      remoteRunning = true;
      const outcome = await deps
        .runRemote({ host, jobClass, sha: current.sha, prefix: current.prefix })
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
      ticket.bypassed = 0;
    }
  } finally {
    for (const [signal, handler] of handlers)
      process.removeListener(signal, handler);
    await removeHostTicket(home, ticket);
    if (reservation) await releaseHostReservation(home, reservation);
  }
}

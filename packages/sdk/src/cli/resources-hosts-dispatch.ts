import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import { probeDisk } from './resources-disk-gate';
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
  releaseHostReservation,
  removeHostTicket,
  updateHostReservation,
} from './resources-hosts-ledger';
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
  pollMs?: number;
  log?: (text: string) => void;
}
const defaultDisk = async (cwd: string) =>
  probeDisk(cwd)
    .then((probe) => probe.freeBytes / 1024 ** 3)
    .catch(() => undefined);

/**
 * Admits one job across the registered hosts and runs it on the assigned
 * host. The reservation is held until the job ends and is released on
 * success, failure, cancellation (SIGINT/SIGTERM/SIGHUP) or, if this broker
 * dies, by liveness pruning in the next admission round.
 */
export async function hostsRun({
  home,
  command,
  args,
  jobClass,
  cwd = process.cwd(),
  registry,
  deps,
}: {
  home: string;
  command: string;
  args: string[];
  jobClass: JobClass;
  cwd?: string;
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
  const plan = hosts.hosts.some((host) => host.kind === 'runner')
    ? await deps.commitPlan(cwd)
    : undefined;
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
  const signalCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
  let cancelled: keyof typeof signalCodes | undefined;
  const waiting = new AbortController();
  const handlers = (
    Object.keys(signalCodes) as (keyof typeof signalCodes)[]
  ).map((signal) => {
    const handler = () => {
      cancelled ??= signal;
      waiting.abort();
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  let reservation: HostReservation | undefined;
  try {
    for (;;) {
      await enqueueHostTicket(home, ticket);
      let announced = 0;
      while (!reservation) {
        if (cancelled) return signalCodes[cancelled];
        const telemetry: HostTelemetry = {
          localDiskFreeGiB: await (deps.localDiskFreeGiB ?? defaultDisk)(cwd),
          snapshot: hosts.hosts.some((host) => host.kind === 'runner')
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
      const host = hosts.hosts.find(
        (entry) => entry.id === reservation!.hostId
      )!;
      log(`admitted ${jobClass} PID ${process.pid} on host ${host.id}`);
      if (host.kind === 'local') {
        const held = reservation;
        return await deps.runLocal({
          host,
          jobClass,
          reservation: held,
          onChild: async (pid) => {
            held.childPid = pid;
            await updateHostReservation(home, held);
          },
        });
      }
      const outcome = await deps.runRemote({
        host,
        jobClass,
        sha: plan!.sha,
        prefix: plan!.prefix,
      });
      if (typeof outcome === 'number') return outcome;
      // The runner refused creation, so no remote run exists: requeue the job
      // for local hosts only instead of failing or running twice.
      log(
        `host ${host.id} refused the run (${outcome.reason}); requeueing for local hosts`
      );
      await releaseHostReservation(home, reservation);
      reservation = undefined;
      ticket.remoteOk = false;
      ticket.bypassed = 0;
    }
  } finally {
    for (const [signal, handler] of handlers)
      process.removeListener(signal, handler);
    await removeHostTicket(home, ticket);
    if (reservation) await releaseHostReservation(home, reservation);
  }
}

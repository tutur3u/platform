import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  type DevboxFleetSnapshot,
  evaluateTrustedRunner,
} from '../devbox-fleet-types';
import { atomicJson } from './resources-config';
import type { HostRegistry, JobClass } from './resources-hosts-config';
import {
  type HostState,
  planAdmissions,
  type Reservation,
  type Waiter,
} from './resources-hosts-plan';
import {
  originalProcessAlive,
  ownershipState,
  type ProcessOwner,
  processInspection,
} from './resources-ownership';
// Canonical per-host reservations live in the shared resources home and are
// only created inside the host-wide admission mutex, so concurrent requesters
// on this machine can never double-assign a slot. Liveness is the owning
// broker PID (or its owned child group): cancel or process death frees it.
import { validateOwnershipRecord } from './resources-ownership-record';
import { snapshotProcesses } from './resources-process-identity';
import { processIdentitySchema } from './resources-process-types';
import {
  errno,
  occupancy,
  processLineage,
  tickets,
  withAdmission,
} from './resources-slots';

const ticketSchema = z
  .object({
    token: z.string().uuid(),
    pid: z.number().int().positive(),
    ownershipVersion: z.literal(1).optional(),
    pidStart: processIdentitySchema.optional(),
    project: z.string().min(1),
    jobClass: z.enum(['light', 'heavy']),
    queuedAt: z.number().int().nonnegative(),
    bypassed: z.number().int().nonnegative(),
    remoteOk: z.boolean(),
    command: z.string().optional(),
  })
  .superRefine(validateOwnershipRecord);
const reservationSchema = z
  .object({
    token: z.string().uuid(),
    pid: z.number().int().positive(),
    ownershipVersion: z.literal(1).optional(),
    pidStart: processIdentitySchema.optional(),
    childPid: z.number().int().positive().optional(),
    childStart: processIdentitySchema.optional(),
    hostId: z.string().min(1),
    jobClass: z.enum(['light', 'heavy']),
    project: z.string().min(1),
    scope: z.enum(['host', 'project']),
    createdAt: z.string(),
    command: z.string().optional(),
  })
  .superRefine(validateOwnershipRecord);
export type HostTicket = z.infer<typeof ticketSchema>;
export type HostReservation = z.infer<typeof reservationSchema>;

const root = (home: string) => join(home, 'hosts-state');
const queueDir = (home: string) => join(root(home), 'queue');
const reservationDir = (home: string, hostId: string) =>
  join(root(home), 'reservations', hostId);
const ticketPath = (home: string, ticket: HostTicket) =>
  join(queueDir(home), `${ticket.queuedAt}-${ticket.token}.json`);
export const reservationPath = (home: string, hostId: string, token: string) =>
  join(reservationDir(home, hostId), `${token}.json`);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (errno(error, 'ENOENT')) return undefined;
    return null;
  }
}
const tokenAt = async (path: string) => {
  const raw = await readJson(path);
  return raw && typeof raw === 'object' && 'token' in raw
    ? String(raw.token)
    : undefined;
};

async function entries<T>(dir: string, schema: z.ZodType<T>) {
  const names = await readdir(dir).catch((error) => {
    if (errno(error, 'ENOENT')) return [] as string[];
    throw error;
  });
  const found: { path: string; value: T }[] = [];
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    const path = join(dir, name);
    const raw = await readJson(path);
    // Removed between readdir and read (released or pruned concurrently).
    if (raw === undefined) continue;
    const parsed = schema.safeParse(raw);
    // A malformed entry closes admission rather than being ignored.
    if (!parsed.success)
      throw new Error(
        `Malformed host ledger entry ${name}; admission is closed.`
      );
    found.push({ path, value: parsed.data });
  }
  return found;
}
// Live tickets and reservations; dead owners are pruned (inside the mutex).
export async function hostLedger(home: string, prune = false) {
  const inspect = processInspection();
  const live = async <T extends ProcessOwner & { token: string }>(
    list: { path: string; value: T }[],
    schema: z.ZodType<T>
  ) => {
    const kept: T[] = [];
    for (const entry of list)
      if (ownershipState(entry.value, inspect()).kind !== 'gone')
        kept.push(entry.value);
      else if (prune) {
        const raw = await readJson(entry.path);
        if (raw === undefined) continue;
        const current = schema.safeParse(raw);
        if (!current.success)
          throw new Error(
            'Malformed host ledger entry during recovery; admission is closed.'
          );
        if (current.data.token === entry.value.token) {
          if (ownershipState(current.data).kind === 'gone')
            await rm(entry.path, { force: true });
          else kept.push(current.data);
        }
      }
    return kept;
  };
  const hosts = await readdir(join(root(home), 'reservations')).catch(
    (error) => {
      if (errno(error, 'ENOENT')) return [] as string[];
      throw error;
    }
  );
  const reservations: HostReservation[] = [];
  for (const host of hosts.sort())
    reservations.push(
      ...(await live(
        await entries(reservationDir(home, host), reservationSchema),
        reservationSchema
      ))
    );
  return {
    tickets: await live(
      await entries(queueDir(home), ticketSchema),
      ticketSchema
    ),
    reservations,
  };
}

export interface HostTelemetry {
  // Free GiB on the local job volume, undefined when it could not be read.
  localDiskFreeGiB?: number;
  // Undefined when the fleet could not be read: every runner is unreachable.
  snapshot?: DevboxFleetSnapshot;
  now?: number;
}
const runnerDisk = (capabilities: Record<string, unknown> | null) => {
  const disk = capabilities?.disk as { freeGiB?: unknown } | undefined;
  return typeof disk?.freeGiB === 'number' && Number.isFinite(disk.freeGiB)
    ? disk.freeGiB
    : undefined;
};
// 1-minute load per CPU from the runner agent's `resources` telemetry.
export function runnerLoadPerCpu(capabilities: Record<string, unknown> | null) {
  const resources = capabilities?.resources as
    | { loadAverage?: unknown; cpu?: { cores?: unknown } }
    | undefined;
  const load = Array.isArray(resources?.loadAverage)
    ? resources.loadAverage[0]
    : undefined;
  const cores = resources?.cpu?.cores;
  return typeof load === 'number' &&
    Number.isFinite(load) &&
    load >= 0 &&
    typeof cores === 'number' &&
    Number.isInteger(cores) &&
    cores > 0
    ? load / cores
    : undefined;
}
// Pure derivation of per-host state from telemetry plus the lane system.
export function hostStates(
  registry: HostRegistry,
  telemetry: HostTelemetry,
  lanes: { owners: number; waiters: number },
  reservations: Pick<Reservation, 'hostId' | 'jobClass' | 'scope'>[]
): Record<string, HostState> {
  const states: Record<string, HostState> = {};
  const owned = (hostId: string, jobClass: JobClass) =>
    reservations.filter(
      (entry) =>
        entry.scope === 'host' &&
        entry.hostId === hostId &&
        entry.jobClass === jobClass
    ).length;
  // Heartbeats are server timestamps, so freshness is judged only by the
  // server's clock; a snapshot without one cannot prove any runner fresh.
  const serverNow = telemetry.snapshot
    ? Date.parse(
        telemetry.snapshot.server_time ?? telemetry.snapshot.generated_at ?? ''
      )
    : Number.NaN;
  const now = telemetry.now ?? serverNow;
  for (const host of registry.hosts) {
    if (host.kind === 'local') {
      // Lane owners (shims, plain `run`, and heavy hosts jobs once they hold
      // a lane) occupy local heavy capacity; a handoff reservation covers a
      // hosts job until its lane owner appears, so never count both.
      states[host.id] = {
        healthy: true,
        diskFreeGiB: telemetry.localDiskFreeGiB,
        external: {
          heavy: Math.max(0, lanes.owners - owned(host.id, 'heavy')),
        },
        laneWaiters: lanes.waiters,
      };
      continue;
    }
    const runner = telemetry.snapshot?.runners.find(
      (entry) => entry.id === host.runnerId
    );
    if (!telemetry.snapshot || !runner) {
      states[host.id] = {
        healthy: false,
        reason: telemetry.snapshot
          ? `runner ${host.runnerId} is not in the fleet`
          : 'fleet telemetry is unreachable',
      };
      continue;
    }
    if (!Number.isFinite(now)) {
      states[host.id] = {
        healthy: false,
        reason: 'fleet snapshot has no server timestamp',
      };
      continue;
    }
    // Without activity telemetry, runs started elsewhere are invisible and
    // the runner could be oversubscribed: never admit it.
    if (!runner.activity) {
      states[host.id] = {
        healthy: false,
        reason: 'runner reports no activity telemetry',
      };
      continue;
    }
    // A loaded runner is degraded and never admitted, preferred or not.
    // Missing load telemetry fails closed like missing activity.
    const load = runnerLoadPerCpu(runner.capabilities);
    const ceiling = host.maxLoadPerCpu ?? 1;
    if (load === undefined || load >= ceiling) {
      states[host.id] = {
        healthy: false,
        reason:
          load === undefined
            ? 'runner reports no load telemetry'
            : `runner is degraded (load ${load.toFixed(2)} per CPU, ceiling ${ceiling})`,
      };
      continue;
    }
    const verdict = evaluateTrustedRunner(runner, now);
    const age = now - Date.parse(runner.last_heartbeat_at ?? '');
    const fresh =
      Number.isFinite(age) &&
      age >= 0 &&
      age < registry.telemetryTtlSeconds * 1000;
    const busy = runner.activity.running_runs + runner.activity.queued_runs;
    const ours = owned(host.id, 'light') + owned(host.id, 'heavy');
    states[host.id] = {
      healthy: verdict.eligible && fresh,
      reason: verdict.eligible
        ? fresh
          ? undefined
          : 'runner telemetry is stale'
        : verdict.reason,
      diskFreeGiB: runnerDisk(runner.capabilities),
      // Runs this ledger did not create (other machines) occupy heavy slots.
      external: { heavy: Math.max(0, busy - ours) },
    };
  }
  return states;
}

// Final check immediately before remote creation: the runner must still be
// eligible, fresh and have known disk above its floor in a snapshot that
// carries the server's own timestamp (never the local clock). Returns the
// blocker, or undefined when dispatch may proceed.
export function remoteDispatchBlocker(
  registry: HostRegistry,
  hostId: string,
  snapshot: DevboxFleetSnapshot | undefined
) {
  const host = registry.hosts.find((entry) => entry.id === hostId);
  if (host?.kind !== 'runner') return 'host is not a runner';
  if (!snapshot) return 'fleet telemetry is unreachable';
  const serverNow = Date.parse(
    snapshot.server_time ?? snapshot.generated_at ?? ''
  );
  if (!Number.isFinite(serverNow))
    return 'fleet snapshot has no server timestamp';
  const state = hostStates(
    registry,
    { snapshot, now: serverNow },
    { owners: 0, waiters: 0 },
    []
  )[hostId]!;
  if (!state.healthy) return state.reason ?? 'runner is not eligible';
  if (state.diskFreeGiB === undefined) return 'runner free disk is unknown';
  if (state.diskFreeGiB < host.reserved.diskGiB)
    return 'runner free disk is below its floor';
  return undefined;
}

// A job admitted under a host reservation exports its token. A nested
// `run --hosts` inside it runs under that reservation instead of queueing
// behind its own ancestor, but only while the reservation is live and its
// broker (or owned child group) is a verified process ancestor.
export const hostReservationMarker = 'TTR_RESOURCES_HOST_RESERVATION';
export async function nestedHostReservation(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
  refresh = false
) {
  const marker = env[hostReservationMarker];
  if (!marker) return undefined;
  const reservation = (await hostLedger(home)).reservations.find(
    (entry) => entry.token === marker && entry.scope === 'host'
  );
  if (!reservation) return undefined;
  const evidence = processLineage(refresh);
  if (!evidence) return undefined;
  const snapshot = snapshotProcesses();
  const related =
    (originalProcessAlive(reservation.pid, reservation.pidStart, snapshot) &&
      evidence.pids.has(reservation.pid)) ||
    (reservation.childPid !== undefined &&
      originalProcessAlive(
        reservation.childPid,
        reservation.childStart,
        snapshot
      ) &&
      (evidence.pids.has(reservation.childPid) ||
        evidence.group === reservation.childPid));
  return related ? reservation : undefined;
}

export async function enqueueHostTicket(home: string, ticket: HostTicket) {
  await withAdmission(home, async () => {
    await mkdir(queueDir(home), { recursive: true, mode: 0o700 });
    await atomicJson(ticketPath(home, ticket), ticket);
  });
}
export async function removeHostTicket(home: string, ticket: HostTicket) {
  await rm(ticketPath(home, ticket), { force: true });
}

export type AdmitResult =
  | { admitted: true; reservation: HostReservation }
  | { admitted: false; reason: string };
// One admission attempt for `ticket`. The plan is recomputed from canonical
// state inside the mutex; only the planned owner acts on its own assignment.
export async function admitHostTicket(
  home: string,
  ticket: HostTicket,
  registry: HostRegistry,
  telemetry: HostTelemetry
): Promise<AdmitResult> {
  const result = await withAdmission(home, async (): Promise<AdmitResult> => {
    const ledger = await hostLedger(home, true);
    if (!ledger.tickets.some((entry) => entry.token === ticket.token))
      return { admitted: false, reason: 'ticket is no longer queued' };
    const lanes = await occupancy(home, false);
    const laneWaiters = (await tickets(home)).length;
    const states = hostStates(
      registry,
      telemetry,
      { owners: lanes.occupied.length, waiters: laneWaiters },
      ledger.reservations
    );
    const waiters: Waiter[] = ledger.tickets.map((entry) => ({
      token: entry.token,
      jobClass: entry.jobClass,
      project: entry.project,
      queuedAt: entry.queuedAt,
      bypassed: entry.bypassed,
      remoteOk: entry.remoteOk,
    }));
    const plan = planAdmissions(registry, states, ledger.reservations, waiters);
    const mine = plan.assignments.find((entry) => entry.token === ticket.token);
    if (!mine)
      return {
        admitted: false,
        reason: plan.blocked[ticket.token] ?? 'waiting for an older request',
      };
    const reservation: HostReservation = {
      token: ticket.token,
      pid: ticket.pid,
      ownershipVersion: ticket.ownershipVersion,
      pidStart: ticket.pidStart,
      hostId: mine.hostId,
      jobClass: ticket.jobClass,
      project: ticket.project,
      scope: 'host',
      createdAt: new Date().toISOString(),
      ...(ticket.command ? { command: ticket.command } : {}),
    };
    await mkdir(reservationDir(home, mine.hostId), {
      recursive: true,
      mode: 0o700,
    });
    await atomicJson(
      reservationPath(home, mine.hostId, ticket.token),
      reservation
    );
    // Count the overtake only for waiters older than the one admitted.
    for (const entry of ledger.tickets)
      if (
        entry.queuedAt < ticket.queuedAt &&
        plan.bypassed.includes(entry.token)
      )
        await atomicJson(ticketPath(home, entry), {
          ...entry,
          bypassed: entry.bypassed + 1,
        });
    await removeHostTicket(home, ticket);
    return { admitted: true, reservation };
  });
  return result ?? { admitted: false, reason: 'admission was cancelled' };
}
export async function updateHostReservation(
  home: string,
  reservation: HostReservation
) {
  await withAdmission(home, async () => {
    const path = reservationPath(home, reservation.hostId, reservation.token);
    if ((await tokenAt(path)) !== reservation.token)
      throw new Error(
        'Owned host reservation changed before child receipt; workload was not launched.'
      );
    await atomicJson(path, reservation);
  });
}
export async function releaseHostReservation(
  home: string,
  reservation: Pick<HostReservation, 'hostId' | 'token'>
) {
  await withAdmission(home, async () => {
    const path = reservationPath(home, reservation.hostId, reservation.token);
    if ((await tokenAt(path)) === reservation.token)
      await rm(path, { force: true });
  });
}

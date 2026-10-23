import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  type DevboxFleetSnapshot,
  evaluateTrustedRunner,
  fleetSnapshotNow,
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
  errno,
  occupancy,
  processAlive,
  processGroupAlive,
  tickets,
  withAdmission,
} from './resources-slots';

// Canonical per-host reservations live in the shared resources home and are
// only created inside the host-wide admission mutex, so concurrent requesters
// on this machine can never double-assign a slot. Liveness is the owning
// broker PID (or its owned child group): cancel or process death frees it.
const ticketSchema = z.object({
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  project: z.string().min(1),
  jobClass: z.enum(['light', 'heavy']),
  queuedAt: z.number().int().nonnegative(),
  bypassed: z.number().int().nonnegative(),
  remoteOk: z.boolean(),
  command: z.string().optional(),
});
const reservationSchema = z.object({
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  childPid: z.number().int().positive().optional(),
  hostId: z.string().min(1),
  jobClass: z.enum(['light', 'heavy']),
  project: z.string().min(1),
  scope: z.enum(['host', 'project']),
  createdAt: z.string(),
  command: z.string().optional(),
});
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
const alive = (entry: { pid: number; childPid?: number }) =>
  processAlive(entry.pid) ||
  (entry.childPid !== undefined && processGroupAlive(entry.childPid));

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
  const live = async <T extends { pid: number; childPid?: number }>(
    list: { path: string; value: T }[]
  ) => {
    const kept: T[] = [];
    for (const entry of list)
      if (alive(entry.value)) kept.push(entry.value);
      else if (prune) await rm(entry.path, { force: true });
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
        await entries(reservationDir(home, host), reservationSchema)
      ))
    );
  return {
    tickets: await live(await entries(queueDir(home), ticketSchema)),
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
  const now =
    telemetry.now ??
    (telemetry.snapshot ? fleetSnapshotNow(telemetry.snapshot) : Date.now());
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
    const verdict = evaluateTrustedRunner(runner, now);
    const age = now - Date.parse(runner.last_heartbeat_at ?? '');
    const fresh =
      Number.isFinite(age) &&
      age >= 0 &&
      age < registry.telemetryTtlSeconds * 1000;
    const busy = runner.activity
      ? runner.activity.running_runs + runner.activity.queued_runs
      : 0;
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
    if ((await tokenAt(path)) === reservation.token)
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

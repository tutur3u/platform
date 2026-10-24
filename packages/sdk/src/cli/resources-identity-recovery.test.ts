import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KernelProcessIdentity,
  ProcessSnapshot,
} from './resources-process-types';

const backend = vi.hoisted(() => ({
  snapshot: vi.fn<() => ProcessSnapshot>(),
  capture: vi.fn<() => KernelProcessIdentity>(),
  observe: vi.fn(),
}));
vi.mock('./resources-process-identity', () => ({
  snapshotProcesses: backend.snapshot,
  requireProcessIdentity: backend.capture,
  observeProcess: backend.observe,
}));

import { atomicJson, defaultResourceConfig } from './resources-config';
import {
  hostLedger,
  reservationPath,
  updateHostReservation,
} from './resources-hosts-ledger';
import { processInspection } from './resources-ownership';
import {
  admittedMarker,
  nestedOwner,
  newOwner,
  occupancy,
  ownerAlive,
  ownerState,
  tickets,
  withAdmission,
} from './resources-slots';

const context = {
  backend: 'linux-proc-v1',
  host: 'same-host',
  boot: 'same-boot',
  namespace: 'pid:[123]',
} as const;
const start = (birth: string): KernelProcessIdentity => ({ ...context, birth });
const row = (pid: number, birth: string, group = pid) => ({
  pid,
  parent: 1,
  group,
  zombie: false,
  identity: start(birth),
});
const view = (...processes: ReturnType<typeof row>[]): ProcessSnapshot => ({
  kind: 'ready',
  context,
  processes,
  unavailable: [],
  complete: true,
});
const homes: string[] = [];
beforeEach(() => {
  backend.snapshot.mockClear();
  backend.observe.mockClear();
  backend.capture.mockReturnValue(start('controller'));
  backend.observe.mockReturnValue({ kind: 'gone' });
  backend.snapshot.mockReturnValue(view(row(process.pid, 'controller')));
  vi.spyOn(process, 'kill').mockImplementation(() => true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const home of homes.splice(0))
    await rm(home, { recursive: true, force: true });
});
async function home() {
  const directory = await mkdtemp(join(tmpdir(), 'resource-start-identity-'));
  homes.push(directory);
  await atomicJson(join(directory, 'config.json'), defaultResourceConfig());
  return directory;
}
const stale = (pid = 101) => ({
  ...newOwner('reused-owner'),
  pid,
  pidStart: start('original-broker'),
});

describe('resource ownership recovery uses the recorded start identity', () => {
  it('retains the same owner when fresh inspection disproves an earlier empty snapshot', async () => {
    const directory = await home();
    const owner = stale();
    backend.snapshot.mockReturnValue(view());
    backend.observe.mockReturnValue({
      kind: 'present',
      process: row(101, 'original-broker'),
    });
    await atomicJson(join(directory, 'slots/0/owner.json'), owner);
    await atomicJson(join(directory, 'queue/0.json'), owner);
    expect(
      (await occupancy(directory, true)).owners.map((entry) => entry.token)
    ).toEqual([owner.token]);
    expect(
      (await tickets(directory, true)).map((entry) => entry.owner.token)
    ).toEqual([owner.token]);
    await atomicJson(join(directory, 'hosts-state/queue/0.json'), {
      token: owner.token,
      pid: owner.pid,
      ownershipVersion: 1,
      pidStart: owner.pidStart,
      project: 'test',
      jobClass: 'heavy',
      queuedAt: Date.now(),
      bypassed: 0,
      remoteOk: false,
    });
    expect(
      (await hostLedger(directory, true)).tickets.map((entry) => entry.token)
    ).toEqual([owner.token]);
  });
  it('does not scan the process table for empty inventories', async () => {
    const directory = await home();
    await occupancy(directory);
    await tickets(directory);
    await hostLedger(directory);
    expect(backend.snapshot).not.toHaveBeenCalled();
  });
  it('checks a live original broker directly and shares one snapshot per inventory round', async () => {
    const directory = await home();
    const owner = stale();
    backend.observe.mockReturnValue({
      kind: 'present',
      process: row(101, 'original-broker'),
    });
    expect(ownerAlive(owner)).toBe(true);
    expect(backend.snapshot).not.toHaveBeenCalled();
    await atomicJson(join(directory, 'slots/0/owner.json'), owner);
    await atomicJson(join(directory, 'queue/0.json'), owner);
    backend.snapshot.mockReturnValue(view(row(101, 'original-broker')));
    const inspect = processInspection();
    await occupancy(directory, false, undefined, inspect);
    await tickets(directory, false, inspect);
    expect(backend.snapshot).toHaveBeenCalledTimes(1);
  });
  it('rejects incomplete version-1 records while retaining legacy records', async () => {
    const directory = await home();
    const path = join(directory, 'slots/0/owner.json');
    const owner = stale();
    await atomicJson(path, { ...owner, pidStart: undefined });
    expect((await ownerState(path)).kind).toBe('invalid');
    await atomicJson(path, { ...owner, childPid: 202 });
    expect((await ownerState(path)).kind).toBe('invalid');
    await atomicJson(path, {
      ...owner,
      ownershipVersion: undefined,
      pidStart: undefined,
    });
    expect((await ownerState(path)).kind).toBe('owner');
  });
  it('does not acknowledge a child receipt after the host reservation disappeared', async () => {
    const directory = await home();
    const reservation = {
      token: '00000000-0000-4000-8000-000000000001',
      hostId: 'local',
      pid: 101,
      jobClass: 'heavy',
      project: 'test',
      scope: 'host',
      createdAt: new Date().toISOString(),
    } as const;
    expect(
      await ownerState(reservationPath(directory, 'local', reservation.token))
    ).toEqual({ kind: 'missing' });
    await expect(updateHostReservation(directory, reservation)).rejects.toThrow(
      'changed before child receipt'
    );
  });
  it('does not let a reused live broker PID retain a slot', async () => {
    const directory = await home();
    const owner = stale();
    backend.snapshot.mockReturnValue(view(row(101, 'replacement')));
    await atomicJson(join(directory, 'slots/0/owner.json'), owner);
    expect(ownerAlive(owner)).toBe(false);
    expect((await occupancy(directory, true)).occupied).toEqual([]);
  });
  it('reclaims a mutex whose broker PID now belongs to another process', async () => {
    const directory = await home();
    backend.snapshot.mockReturnValue(
      view(row(process.pid, 'controller'), row(101, 'replacement'))
    );
    await mkdir(join(directory, 'admission'));
    await atomicJson(join(directory, 'admission/owner.json'), stale());
    let polls = 0;
    let entered = false;
    await withAdmission(
      directory,
      async () => {
        entered = true;
      },
      () => ++polls > 8
    );
    expect(entered).toBe(true);
  });
  it('does not retain a new unrelated child group after both recorded PIDs were reused', () => {
    const owner = {
      ...stale(),
      childPid: 202,
      childStart: start('original-child'),
    };
    backend.snapshot.mockReturnValue(
      view(
        row(101, 'replacement'),
        row(202, 'replacement-child'),
        row(303, 'unrelated-descendant', 202)
      )
    );
    expect(ownerAlive(owner)).toBe(false);
  });
  it('retains surviving original descendants when the broker and launcher are gone', () => {
    const owner = {
      ...stale(),
      childPid: 202,
      childStart: start('original-child'),
    };
    backend.snapshot.mockReturnValue(
      view(row(303, 'original-descendant', 202))
    );
    expect(ownerAlive(owner)).toBe(true);
    backend.snapshot.mockReturnValue(view());
    expect(ownerAlive(owner)).toBe(false);
  });
  it('reserves occupancy when identity inspection is unavailable', () => {
    backend.snapshot.mockReturnValue({
      kind: 'unavailable',
      reason: 'process metadata denied',
    });
    expect(ownerAlive(stale())).toBe(true);
  });
  it('rejects a copied marker when its numeric ancestor PID belongs to a replacement', async () => {
    const directory = await home();
    const owner = stale(process.ppid);
    await atomicJson(join(directory, 'slots/0/owner.json'), owner);
    backend.snapshot.mockReturnValue(view(row(process.ppid, 'replacement')));
    expect(
      await nestedOwner(directory, { [admittedMarker]: owner.token }, true)
    ).toBeUndefined();
  });
  it('keeps genuine nesting but rechecks start identity after an earlier successful lookup', async () => {
    const directory = await home();
    const owner = stale(process.ppid);
    await atomicJson(join(directory, 'slots/0/owner.json'), owner);
    backend.snapshot.mockReturnValue(
      view(row(process.ppid, 'original-broker'))
    );
    expect(
      (await nestedOwner(directory, { [admittedMarker]: owner.token }, true))
        ?.token
    ).toBe(owner.token);
    backend.snapshot.mockReturnValue(view(row(process.ppid, 'replacement')));
    expect(
      await nestedOwner(directory, { [admittedMarker]: owner.token })
    ).toBeUndefined();
  });
});

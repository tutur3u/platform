import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseRunRequest } from '@tuturuuu/devbox';
import { afterEach, expect, it, vi } from 'vitest';
import { type ControllerDeps, dispatchRun } from './balancer-controller';
import { BalancerLedger } from './balancer-ledger';
import { fixtureHost } from './balancer-test-fixtures';

const fault = vi.hoisted((): { fsType: number | undefined } => ({
  fsType: undefined,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    statfs: async (...args: Parameters<typeof real.statfs>) => {
      const info = await real.statfs(...args);
      return fault.fsType === undefined
        ? info
        : { ...info, type: fault.fsType };
    },
  };
});
const dirs: string[] = [];
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
};
const home = async () => {
  const path = await mkdtemp(join(tmpdir(), 'balancer-admission-'));
  dirs.push(path);
  return path;
};
const mutexPath = (ledger: BalancerLedger) => {
  const current = join(ledger.root, '.lock', 'mutex');
  return existsSync(current)
    ? current
    : join(ledger.root, 'mutation-lock.sqlite');
};
afterEach(async () => {
  fault.fsType = undefined;
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

// Actual predecessor protocol with a live owner, without stale-PID recovery.
class LegacyLedger extends BalancerLedger {
  pauseRead = false;
  readonly read = gate();
  readonly resume = gate();
  override async withLock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(join(this.root, 'runs'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'requests'), { recursive: true, mode: 0o700 });
    const lock = join(this.root, '.lock');
    await mkdir(lock, { mode: 0o700 });
    await writeFile(join(lock, 'pid'), String(process.pid));
    try {
      return await action();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  override async readRun(runId: string) {
    const run = await super.readRun(runId);
    if (this.pauseRead) {
      this.pauseRead = false;
      this.read.resolve();
      await this.resume.promise;
    }
    return run;
  }
}

it('refuses a legacy ledger while its live controller holds a queued revision', async () => {
  const path = await home();
  const old = new LegacyLedger(path),
    current = new BalancerLedger(path);
  const {
    runs: [run],
  } = await old.submit(
    parseRunRequest({
      requestId: 'proof-mixed-protocol',
      source: { repo: 'tutur3u/platform', baseSha: 'a'.repeat(40) },
      command: ['true'],
    })
  );
  if (!run) throw new Error('Missing queued run');
  const starts: string[] = [];
  let leases = 0;
  const deps = (ledger: BalancerLedger): ControllerDeps => ({
    ledger,
    registry: {
      telemetryTtlSeconds: 60,
      hosts: [fixtureHost('linux'), fixtureHost('thanh')],
    },
    newLeaseId: () =>
      `00000000-0000-4000-8000-${String(++leases).padStart(12, '0')}`,
    transport: () => ({
      call: async (host, action) => {
        if (action === 'start') starts.push(host.id);
        return { ok: true, value: { accepted: true } };
      },
    }),
  });
  old.pauseRead = true;
  const older = dispatchRun(deps(old), run, 'thanh');
  await old.read.promise;
  let error: unknown;
  try {
    error = await dispatchRun(deps(current), run, 'linux').then(
      () => undefined,
      (cause: unknown) => cause
    );
  } finally {
    old.resume.resolve();
    await older;
  }
  expect(starts).toEqual(['thanh']);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toMatch(/legacy|incomplete/iu);
});

it.each([
  ['NFS', 0x6969],
  ['SMB', 0xff534d42],
  ['FUSE', 0x65735546],
  ['unknown', 0],
])('refuses %s filesystem admission before mutation', async (_name, type) => {
  const ledger = new BalancerLedger(await home());
  fault.fsType = type;
  let entered = false;
  const error = await ledger
    .withLock(async () => {
      entered = true;
    })
    .then(
      () => undefined,
      (cause: unknown) => cause
    );
  expect(entered).toBe(false);
  expect(String(error)).toMatch(/local filesystem|shared|unknown filesystem/iu);
});

it.each(['missing', 'replaced'] as const)(
  'refuses a %s mutex while another controller holds the original inode',
  async (mode) => {
    const path = await home();
    const a = new BalancerLedger(path),
      b = new BalancerLedger(path);
    const entered = gate(),
      resume = gate();
    const held = a.withLock(async () => {
      entered.resolve();
      await resume.promise;
    });
    await entered.promise;
    let secondEntered = false;
    let error: unknown;
    try {
      const mutex = mutexPath(a);
      await rm(mutex);
      if (mode === 'replaced')
        await writeFile(mutex, '', { flag: 'wx', mode: 0o600 });
      error = await b
        .withLock(async () => {
          secondEntered = true;
        })
        .then(
          () => undefined,
          (cause: unknown) => cause
        );
    } finally {
      resume.resolve();
      await held;
    }
    expect(secondEntered).toBe(false);
    expect(String(error)).toMatch(/replaced|incomplete/iu);
  }
);

it('permanently fences both earlier protocols, including controllers started later', async () => {
  const ledger = new BalancerLedger(await home());
  await ledger.withLock(async () => {});
  await expect(mkdir(join(ledger.root, '.lock'))).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(
    () => new DatabaseSync(join(ledger.root, 'mutation-lock.sqlite'))
  ).toThrow();
  expect(
    await readFile(join(ledger.root, 'mutation-lock.sqlite', 'retired'), 'utf8')
  ).toBe('descriptor-lock-v1');
  await expect(
    new BalancerLedger(join(ledger.root, '..')).withLock(async () => 'ok')
  ).resolves.toBe('ok');
});

it('does not adopt a stopped legacy ledger or repair an incomplete initialization', async () => {
  const ledger = new BalancerLedger(await home());
  await mkdir(ledger.root, { mode: 0o700 });
  await expect(ledger.withLock(async () => {})).rejects.toThrow(
    /legacy|incomplete/iu
  );
  await expect(
    readFile(join(ledger.root, '.lock', 'protocol.json'))
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

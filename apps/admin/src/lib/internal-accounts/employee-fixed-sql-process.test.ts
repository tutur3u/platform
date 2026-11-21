import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  executeFixedEmployeeSql,
  isFixedEmployeeCommitFresh,
} from './employee-fixed-sql-process';
import {
  Command,
  isWorkerCommitLive,
  Message,
  parseBounded,
} from './employee-fixed-sql-protocol.mjs';

vi.mock('server-only', () => ({}));
const worker = pathToFileURL(
  resolve(
    process.cwd(),
    'src/lib/internal-accounts/employee-fixed-sql-worker.mjs'
  )
);
const identity = {
  actorUserId: randomUUID(),
  userId: randomUUID(),
  email: 'fixture@tuturuuu.com',
  displayName: 'Fixture',
};
describe('fixed employee worker boundary', () => {
  it('denies missing external qualification without executing an operation', async () => {
    expect(
      await executeFixedEmployeeSql({
        phase: 'preflight',
        identity,
        database: {},
        requirements: {},
      })
    ).toEqual({ kind: 'denied' });
  });
  it('rejects arbitrary SQL, wrong opcode and extra start fields', () => {
    expect(
      parseBounded(Command, {
        kind: 'query',
        session: randomUUID(),
        sql: 'select 1',
      })
    ).toBeNull();
    expect(
      parseBounded(Command, { kind: 'commit', session: 'wrong' })
    ).toBeNull();
    expect(
      parseBounded(Command, {
        kind: 'abort',
        session: randomUUID(),
        sql: 'select 1',
      })
    ).toBeNull();
  });
  it('rejects oversized or incomplete catalog snapshots', () => {
    expect(
      parseBounded(Message, {
        kind: 'catalog',
        session: randomUUID(),
        checkpoint: 'before-effect',
        peerCertificateSha256: 'a'.repeat(64),
        rows: [],
      })
    ).toBeNull();
    expect(
      parseBounded(Message, {
        kind: 'committed',
        session: randomUUID(),
        result: 'x'.repeat(262145),
      })
    ).toBeNull();
  });
  it.each([
    { kind: 'authorize', session: randomUUID(), checkpoint: 'before-effect' },
    { kind: 'commit', session: randomUUID() },
    { kind: 'start', session: randomUUID(), sql: 'select 1' },
  ])('retires a real child on invalid initial sequencing %#', async (input) => {
    const child = fork(worker, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: { NODE_ENV: 'production' },
    });
    const closed = once(child, 'close');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    child.send(input);
    const [code, signal] = await closed;
    clearTimeout(timer);
    expect(signal).toBeNull();
    expect(code).toBe(0);
    expect(child.connected).toBe(false);
  });
});

describe('owned worker client drain (no PostgreSQL server)', () => {
  it.each(['disconnect', 'duplicate-start', 'wrong-session'])(
    'closes its actual TCP descriptor after %s',
    async (action) => {
      const server = createServer();
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Fixture listener unavailable');
      const child = fork(worker, [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        execArgv: [],
        env: { NODE_ENV: 'production' },
      });
      // Explicit parent IPC disconnect suppresses Node's close event; exit plus
      // accepted socket close proves this owned fixture process/descriptor drain.
      const childClosed = once(
        child,
        action === 'disconnect' ? 'exit' : 'close'
      );
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      const accepted = once(server, 'connection');
      const start = {
        kind: 'start',
        session: randomUUID(),
        phase: 'preflight',
        identity,
        database: {
          host: '127.0.0.1',
          port: address.port,
          user: 'fixture',
          password: 'fixture',
          database: 'fixture',
        },
      };
      child.send(start);
      const [socket] = await accepted;
      const socketClosed = once(socket, 'close');
      socket.on('data', () => {});
      if (action === 'disconnect') {
        child.disconnect();
        child.ref();
      } else if (action === 'duplicate-start') child.send(start);
      else child.send({ kind: 'abort', session: randomUUID() });
      try {
        await childClosed;
        await socketClosed;
        expect(socket.destroyed).toBe(true);
        expect(child.connected).toBe(false);
      } finally {
        clearTimeout(timer);
        socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  );
});

describe('fresh committing authorization', () => {
  const admitted = {
    now: 1000,
    monotonicNow: 100,
    deadlineAt: 13000,
    qualification: { observedAt: 0, expiresAt: 6000 },
    proof: { observedAt: 900, expiresAt: 2000 },
  };
  function authorize(overrides: Partial<typeof admitted> = {}) {
    return isFixedEmployeeCommitFresh({
      signal: new AbortController().signal,
      ...admitted,
      ...overrides,
    });
  }
  it('allows a live catalog proof at committing', () => {
    expect(authorize()).toBe(true);
  });
  it('denies delayed committing after the earlier admitted proof expires', () => {
    expect(authorize()).toBe(true);
    expect(authorize({ now: 2000 })).toBe(false);
  });
  it('denies an expired execution qualification despite a live later proof', () => {
    expect(
      authorize({ now: 6000, proof: { observedAt: 5900, expiresAt: 7000 } })
    ).toBe(false);
  });
  it('denies a passed monotonic deadline even with fresh wall-clock proof', () => {
    expect(authorize({ monotonicNow: 13000 })).toBe(false);
  });
  it('denies aborted or absent-proof commit authorization', () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      isFixedEmployeeCommitFresh({ signal: controller.signal, ...admitted })
    ).toBe(false);
    expect(
      isFixedEmployeeCommitFresh({
        signal: new AbortController().signal,
        ...admitted,
        proof: null,
      })
    ).toBe(false);
  });
  it('denies future or non-finite clocks/proofs', () => {
    expect(authorize({ now: 899 })).toBe(false);
    expect(authorize({ monotonicNow: Number.NaN })).toBe(false);
  });
});

describe('worker commit IPC expiry', () => {
  it('requires explicit bounded commit expiry in the fixed opcode', () => {
    expect(
      parseBounded(Command, { kind: 'commit', session: randomUUID() })
    ).toBeNull();
    expect(
      parseBounded(Command, {
        kind: 'commit',
        session: randomUUID(),
        expiresAt: 2000,
      })
    ).not.toBeNull();
  });
  it('denies delayed IPC consumption after proof or local process deadline', () => {
    const live = { expiresAt: 2000, bornAt: 100, now: 1000, monotonicNow: 200 };
    expect(isWorkerCommitLive(live)).toBe(true);
    expect(isWorkerCommitLive({ ...live, now: 2000 })).toBe(false);
    expect(isWorkerCommitLive({ ...live, monotonicNow: 13100 })).toBe(false);
  });
});

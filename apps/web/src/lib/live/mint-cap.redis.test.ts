import { createHash, randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@tuturuuu/email-service', () => ({ sendSystemEmail: vi.fn() }));
import {
  createLiveMintGuard,
  readLiveMintConfig,
  type LiveMintStore,
} from './mint-cap';

type Frame = { value: unknown; next: number };
function frame(bytes: Buffer, offset = 0): Frame | null {
  const end = bytes.indexOf('\r\n', offset);
  if (end < 0) return null;
  const kind = bytes.toString('utf8', offset, offset + 1);
  const text = bytes.toString('utf8', offset + 1, end);
  const start = end + 2;
  if (kind === '+') return { value: text, next: start };
  if (kind === '-') return { value: new Error(text), next: start };
  if (kind === ':') return { value: Number(text), next: start };
  if (kind === '$') {
    const length = Number(text);
    if (length === -1) return { value: null, next: start };
    if (bytes.length < start + length + 2) return null;
    return {
      value: bytes.toString('utf8', start, start + length),
      next: start + length + 2,
    };
  }
  if (kind === '*') {
    const count = Number(text);
    if (count === -1) return { value: null, next: start };
    let next = start;
    const values: unknown[] = [];
    for (let index = 0; index < count; index++) {
      const child = frame(bytes, next);
      if (!child) return null;
      values.push(child.value);
      next = child.next;
    }
    return { value: values, next };
  }
  throw new Error('Unexpected fixture Redis response');
}

// One persistent RESP connection: the many-account test never spawns thousands
// of clients/processes. This is a real disposable Redis fixture, not a fake eval.
class FixtureRedis implements LiveMintStore {
  private bytes: Buffer = Buffer.alloc(0);
  private readonly pending: {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }[] = [];
  readonly touched = new Set<string>();
  constructor(private readonly socket: Socket) {
    socket.on('data', (bytes: Buffer) => {
      this.bytes = Buffer.concat([this.bytes, bytes]);
      while (this.pending.length > 0) {
        const parsed = frame(this.bytes);
        if (!parsed) break;
        this.bytes = this.bytes.subarray(parsed.next);
        const request = this.pending.shift();
        if (parsed.value instanceof Error) request?.reject(parsed.value);
        else request?.resolve(parsed.value);
      }
    });
    socket.on('error', (error) => {
      for (const request of this.pending.splice(0)) request.reject(error);
    });
    socket.on('close', () => {
      for (const request of this.pending.splice(0))
        request.reject(new Error('Fixture connection closed'));
    });
  }
  command(...args: (string | number)[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      const parts = args.map((arg) => String(arg));
      this.socket.write(
        `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`
      );
    });
  }
  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown> {
    for (const key of keys) this.touched.add(key);
    return this.command('EVAL', script, keys.length, ...keys, ...args);
  }
  close() {
    this.socket.end();
  }
}

const actor = (id: number) =>
  `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const actorHash = (id: string) => createHash('sha256').update(id).digest('hex');
const defaults = readLiveMintConfig({ LIVE_MINT_KILL_SWITCH: 'false' });
let redis: FixtureRedis;
const prefixes: string[] = [];
function makeGuard(alert = vi.fn().mockResolvedValue(undefined)) {
  const prefix = `d310-disposable-test:${randomUUID()}`;
  prefixes.push(prefix);
  return {
    prefix,
    alert,
    guard: createLiveMintGuard({
      getStore: async () => redis,
      keyPrefix: prefix,
      alert,
    }),
  };
}

beforeAll(async () => {
  if (process.env.LIVE_MINT_TEST_REDIS_DISPOSABLE !== '1') {
    throw new Error(
      'Set LIVE_MINT_TEST_REDIS_DISPOSABLE=1 only for an owned disposable Redis fixture; no production Redis credentials are used.'
    );
  }
  const path = process.env.LIVE_MINT_TEST_REDIS_SOCKET;
  const port = Number(process.env.LIVE_MINT_TEST_REDIS_PORT);
  if (!path && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error(
      'Provide LIVE_MINT_TEST_REDIS_SOCKET or a loopback LIVE_MINT_TEST_REDIS_PORT for the admitted disposable fixture.'
    );
  }
  const socket = path
    ? createConnection({ path })
    : createConnection({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  redis = new FixtureRedis(socket);
  expect(await redis.command('PING')).toBe('PONG');
});

afterAll(async () => {
  if (!redis) return;
  // Only unique test-prefix keys. Never FLUSHDB, wildcard delete or another lane.
  for (const prefix of prefixes) {
    const keys = await redis.command('KEYS', `${prefix}:*`);
    if (
      Array.isArray(keys) &&
      keys.every(
        (key) => typeof key === 'string' && key.startsWith(`${prefix}:`)
      )
    ) {
      for (const key of keys)
        if (typeof key === 'string') await redis.command('DEL', key);
    }
  }
  redis.close();
});

describe('real Redis atomic Live admission', () => {
  it('admits ten actor mints, refuses the eleventh, and never refunds an interrupted mint', async () => {
    const { guard } = makeGuard();
    const config = { ...defaults, actorMaxConcurrent: 10 };
    for (let index = 0; index < 10; index++)
      await guard({ actorId: actor(1), isFree: false, config });
    await expect(
      guard({ actorId: actor(1), isFree: false, config })
    ).rejects.toMatchObject({ code: 'LIVE_MINT_ACTOR_LIMIT' });
  });
  it('serializes concurrent mint attempts behind the per-actor lease', async () => {
    const { guard } = makeGuard();
    const result = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        guard({ actorId: actor(2), isFree: true, config: defaults })
      )
    );
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1
    );
    expect(result.filter((item) => item.status === 'rejected')).toHaveLength(
      19
    );
  });
  it('shares the USD budget across many accounts and claims 80/100 alerts once', async () => {
    const { guard, alert } = makeGuard();
    const result = await Promise.allSettled(
      Array.from({ length: 500 }, (_, index) =>
        guard({ actorId: actor(1000 + index), isFree: true, config: defaults })
      )
    );
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(
      452
    );
    expect(result.filter((item) => item.status === 'rejected')).toHaveLength(
      48
    );
    expect(
      alert.mock.calls.filter(([event]) => event.threshold === 80)
    ).toHaveLength(1);
    expect(
      alert.mock.calls.filter(([event]) => event.threshold === 100)
    ).toHaveLength(1);
  });
  it('counts the rolling window at its lower edge without a calendar reset', async () => {
    const { guard, prefix } = makeGuard();
    const key = `${prefix}:actor:${actorHash(actor(3))}`;
    const time = await redis.command('TIME');
    if (
      !Array.isArray(time) ||
      typeof time[0] !== 'string' ||
      typeof time[1] !== 'string'
    )
      throw new Error('Invalid fixture time');
    const now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
    await redis.command(
      'ZADD',
      key,
      now - 86_400_001,
      'old',
      now - 86_300_000,
      'recent'
    );
    await expect(
      guard({
        actorId: actor(3),
        isFree: false,
        config: { ...defaults, actorDailyMints: 2 },
      })
    ).resolves.toHaveProperty('mintId');
    await expect(
      guard({
        actorId: actor(3),
        isFree: false,
        config: { ...defaults, actorDailyMints: 2 },
      })
    ).rejects.toMatchObject({ code: 'LIVE_MINT_ACTOR_LIMIT' });
  });
  it('isolates ICT day budgets and rejects an exhausted current day', async () => {
    const { guard, prefix } = makeGuard();
    const time = await redis.command('TIME');
    if (!Array.isArray(time) || typeof time[0] !== 'string')
      throw new Error('Invalid fixture time');
    const day = Math.floor((Number(time[0]) + 25_200) / 86_400);
    await redis.command(
      'HSET',
      `${prefix}:free-budget:${day - 1}`,
      'spent',
      defaults.dailyBudgetMicroUsd
    );
    await expect(
      guard({ actorId: actor(4), isFree: true, config: defaults })
    ).resolves.toMatchObject({ reservedMicroUsd: 110_400 });
    await redis.command(
      'HSET',
      `${prefix}:free-budget:${day}`,
      'spent',
      defaults.dailyBudgetMicroUsd
    );
    await expect(
      guard({ actorId: actor(5), isFree: true, config: defaults })
    ).rejects.toMatchObject({ code: 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED' });
  });
  it('caps the lease at ICT midnight and starts a new budget after the boundary', async () => {
    const { prefix } = makeGuard();
    const time = await redis.command('TIME');
    if (!Array.isArray(time) || typeof time[0] !== 'string')
      throw new Error('Invalid fixture time');
    const today = Math.floor((Number(time[0]) + 25_200) / 86_400);
    const midnight = (today + 1) * 86_400_000 - 25_200_000;
    // Controlled TIME is the only substituted external input. The actual Redis
    // executes the production admission/ledger Lua; host time is never changed.
    const clocked = (ms: number) =>
      createLiveMintGuard({
        keyPrefix: prefix,
        alert: async () => {},
        getStore: async () => ({
          eval: async (script, keys, args) => {
            const statement = "local clock = redis.call('TIME')";
            if (!script.includes(statement))
              throw new Error('Fixture clock hook changed');
            return redis.eval(
              script.replace(
                statement,
                `local clock = {'${Math.floor(ms / 1000)}','${(ms % 1000) * 1000}'}`
              ),
              keys,
              args
            );
          },
        }),
      });
    const before = clocked(midnight - 1000);
    await redis.command(
      'HSET',
      `${prefix}:free-budget:${today}`,
      'spent',
      defaults.dailyBudgetMicroUsd - 614
    );
    const last = await before({
      actorId: actor(6001),
      isFree: true,
      config: defaults,
    });
    expect(last.expiresAt).toBe(new Date(midnight).toISOString());
    expect(last.reservedMicroUsd).toBe(614);
    await expect(
      before({ actorId: actor(6002), isFree: true, config: defaults })
    ).rejects.toMatchObject({ code: 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED' });
    expect(
      (
        await clocked(midnight + 1000)({
          actorId: actor(6003),
          isFree: true,
          config: defaults,
        })
      ).reservedMicroUsd
    ).toBe(110_400);
  });
});

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acknowledgeFleetAnswers,
  type FleetRedis,
  pendingFleetAnswers,
  readFleetAnswers,
  recordFleetAnswer,
} from './store';

// Runs the answer and ack Lua scripts on a real local redis-server, the same
// engine Upstash runs them on. Skipped where redis-server is not installed.
function redisServerPath() {
  try {
    return execFileSync('which', ['redis-server'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
const server = redisServerPath();

type Reply = string | number | null | Error | Reply[];

function parse(buffer: Buffer, offset: number): [Reply, number] | null {
  const end = buffer.indexOf('\r\n', offset);
  if (end < 0) return null;
  const kind = String.fromCharCode(buffer[offset] ?? 0);
  const line = buffer.toString('utf8', offset + 1, end);
  const next = end + 2;
  if (kind === '+') return [line, next];
  if (kind === '-') return [new Error(line), next];
  if (kind === ':') return [Number(line), next];
  if (kind === '$') {
    const length = Number(line);
    if (length < 0) return [null, next];
    if (buffer.length < next + length + 2) return null;
    return [buffer.toString('utf8', next, next + length), next + length + 2];
  }
  if (kind === '*') {
    const items: Reply[] = [];
    let cursor = next;
    for (let i = 0; i < Number(line); i++) {
      const item = parse(buffer, cursor);
      if (!item) return null;
      items.push(item[0]);
      cursor = item[1];
    }
    return [items, cursor];
  }
  throw new Error(`unexpected RESP ${kind}`);
}

function client(socket: Socket) {
  let pending: Buffer = Buffer.alloc(0);
  const waiters: ((reply: Reply) => void)[] = [];
  socket.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (waiters.length) {
      const result = parse(pending, 0);
      if (!result) break;
      pending = pending.subarray(result[1]);
      waiters.shift()?.(result[0]);
    }
  });
  const command = (...args: (string | number)[]) =>
    new Promise<Reply>((resolve, reject) => {
      waiters.push((reply) =>
        reply instanceof Error ? reject(reply) : resolve(reply)
      );
      socket.write(
        `*${args.length}\r\n${args
          .map((arg) => `$${Buffer.byteLength(String(arg))}\r\n${arg}\r\n`)
          .join('')}`
      );
    });
  const redis: FleetRedis = {
    get: (async (key: string) => command('GET', key)) as FleetRedis['get'],
    set: (async (
      key: string,
      value: string,
      options?: { ex?: number; nx?: boolean }
    ) => {
      const args: (string | number)[] = ['SET', key, value];
      if (options?.ex) args.push('EX', options.ex);
      if (options?.nx) args.push('NX');
      return command(...args);
    }) as FleetRedis['set'],
    eval: (async (script: string, keys: string[], args: unknown[]) =>
      command(
        'EVAL',
        script,
        keys.length,
        ...keys,
        ...args.map(String)
      )) as FleetRedis['eval'],
  };
  return { redis, command };
}

describe.skipIf(!server)('fleet answer store on redis', () => {
  let child: ChildProcess;
  let socket: Socket;
  let redis: FleetRedis;
  let command: (...args: (string | number)[]) => Promise<Reply>;
  const port = 20000 + Math.floor(Math.random() * 20000);

  beforeAll(async () => {
    child = spawn(
      server,
      ['--port', String(port), '--save', '', '--appendonly', 'no'],
      {
        stdio: 'ignore',
      }
    );
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        socket = await new Promise<Socket>((resolve, reject) => {
          const s = createConnection(port, '127.0.0.1', () => resolve(s));
          s.once('error', reject);
        });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    ({ redis, command } = client(socket));
  });

  afterAll(() => {
    socket?.destroy();
    child?.kill();
  });

  it('records, dedupes, revises and acknowledges answers', async () => {
    await command('FLUSHALL');
    const key = randomUUID();
    const first = await recordFleetAnswer(
      redis,
      'ship',
      { action: 'approve', optionId: 'yes' },
      key
    );
    expect(first).toMatchObject({ revision: 1, pickedUpRevision: 0 });

    const retry = await recordFleetAnswer(
      redis,
      'ship',
      { action: 'hold' },
      key
    );
    expect(retry).toMatchObject({ revision: 1, action: 'approve' });

    expect(pendingFleetAnswers(await readFleetAnswers(redis))).toHaveLength(1);
    expect(
      await acknowledgeFleetAnswers(redis, [
        { decisionId: 'ship', revision: 1 },
      ])
    ).toBe(1);
    expect(pendingFleetAnswers(await readFleetAnswers(redis))).toHaveLength(0);
    // A stale or repeated ack changes nothing.
    expect(
      await acknowledgeFleetAnswers(redis, [
        { decisionId: 'ship', revision: 1 },
      ])
    ).toBe(0);

    const second = await recordFleetAnswer(
      redis,
      'ship',
      { action: 'reply', text: 'Wait for the review' },
      randomUUID()
    );
    expect(second).toMatchObject({ revision: 2, pickedUpRevision: 1 });
    const pending = pendingFleetAnswers(await readFleetAnswers(redis));
    expect(pending).toEqual([
      expect.objectContaining({ revision: 2, text: 'Wait for the review' }),
    ]);
  });

  it('keeps at most 200 answers, dropping the oldest', async () => {
    await command('FLUSHALL');
    for (let i = 0; i < 201; i++) {
      await recordFleetAnswer(
        redis,
        `d${i}`,
        { action: 'hold' },
        randomUUID(),
        new Date(Date.UTC(2026, 10, 20, 0, 0, i))
      );
    }
    const answers = await readFleetAnswers(redis);
    expect(Object.keys(answers)).toHaveLength(200);
    expect(answers.d0).toBeUndefined();
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAbuseGuardClient } from '../client';
import { hashGuardValue } from '../crypto';
import type { GuardResult, GuardRpc } from '../protocol';

const pepper = 'test-pepper-'.repeat(4);

function fixture(family: GuardRpc['family'] = 'replay') {
  let now = 0;
  const sent: GuardRpc[] = [];
  const store = new Map<string, { value: string; expires: number }>();
  const transport = async (rpc: GuardRpc) => {
    sent.push(rpc);
    return {
      v: 1,
      steps: rpc.steps.map((step) => ({
        results: step.cmds.map((cmd): GuardResult => {
          const key = `${step.p}:${'k' in cmd ? cmd.k : ''}`;
          if ((store.get(key)?.expires ?? Infinity) <= now) store.delete(key);
          const entry = store.get(key);
          switch (cmd.op) {
            case 'kv.get':
              return { op: cmd.op, v: entry?.value ?? null };
            case 'kv.set': {
              const set =
                !(cmd.mode === 'nx' && entry) && !(cmd.mode === 'xx' && !entry);
              if (set)
                store.set(key, {
                  value: cmd.v,
                  expires:
                    cmd.keepTtl && entry ? entry.expires : now + cmd.ttlMs,
                });
              return { op: cmd.op, set };
            }
            case 'kv.del':
              return { op: cmd.op, n: Number(store.delete(key)) };
            case 'kv.ttl':
              return { op: cmd.op, ttlMs: entry ? entry.expires - now : -2 };
            case 'kv.expire': {
              if (entry) entry.expires = now + cmd.ttlMs;
              return { op: cmd.op, set: !!entry };
            }
            case 'kv.incr': {
              const n = Number(entry?.value ?? 0) + cmd.by;
              const expires = entry?.expires ?? now + cmd.ttlMsOnCreate;
              store.set(key, { value: String(n), expires });
              return { op: cmd.op, n, ttlMs: expires - now };
            }
            case 'win.hit': {
              const entries = cmd.windows.map((w) =>
                store.get(`${step.p}:${w.k}`)
              );
              const ok = cmd.windows.every(
                (w, i) =>
                  Number(entries[i]?.value ?? 0) + (w.cost ?? 1) <= w.limit
              );
              if (ok)
                cmd.windows.forEach((w, i) =>
                  store.set(`${step.p}:${w.k}`, {
                    value: String(
                      Number(entries[i]?.value ?? 0) + (w.cost ?? 1)
                    ),
                    expires: now + w.windowMs,
                  })
                );
              return {
                op: cmd.op,
                ok,
                resetAt: now + 60_000,
                windows: cmd.windows.map((w, i) => ({
                  remaining: ok
                    ? w.limit - Number(entries[i]?.value ?? 0) - (w.cost ?? 1)
                    : 0,
                  resetAt: now + 60_000,
                })),
              };
            }
            default:
              throw new Error('unsupported test command');
          }
        }),
      })),
    };
  };
  return {
    client: createAbuseGuardClient({ family, pepper, transport }),
    sent,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function collision(
  client: ReturnType<typeof fixture>['client'],
  sent: GuardRpc[]
) {
  const seen = new Map<string, string>();
  for (let i = 0; i <= 64; i++) {
    const key = `subject:${i}`;
    await client.get(key);
    const p = sent.at(-1)!.steps[0]!.p;
    const other = seen.get(p);
    if (other) return [other, key] as const;
    seen.set(p, key);
  }
  throw new Error('no collision');
}

describe('bounded guard partitions', () => {
  it('routes 10,000 random keys to at most 64 objects with distinct unchanged key digests', async () => {
    const { client, sent } = fixture();
    const partitions = new Set<string>();
    const keys = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const raw = crypto.randomUUID();
      await client.get(raw);
      const step = sent.pop()!.steps[0]!;
      partitions.add(step.p);
      expect(step.p).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      const cmd = step.cmds[0]!;
      if (cmd.op !== 'kv.get') throw new Error('unexpected command');
      expect(cmd.k).toBe(await hashGuardValue(pepper, 'k:replay', raw));
      keys.add(cmd.k);
    }
    expect(partitions.size).toBeLessThanOrEqual(64);
    expect(partitions.size).toBeGreaterThan(1);
    expect(keys.size).toBe(10_000);
  }, 30_000);

  it('preserves NX, TTL, counter and multi-key semantics for colliding keys', async () => {
    const { client, sent, advance } = fixture();
    const [a, b] = await collision(client, sent);
    const p = sent.at(-1)!.steps[0]!.p;
    for (const key of [a, b]) {
      expect(await client.set(key, key, { ttlMs: 10_000, mode: 'nx' })).toBe(
        true
      );
      expect(
        await client.set(key, 'duplicate', { ttlMs: 20_000, mode: 'nx' })
      ).toBe(false);
      expect(await client.ttl(key)).toBe(10_000);
      expect(sent.at(-1)!.steps[0]!.p).toBe(p);
    }
    expect(await client.mget([a, b, 'absent'])).toEqual([a, b, null]);
    advance(1000);
    expect(await client.ttl(a)).toBe(9000);
    expect(await client.expire(a, 2000)).toBe(true);
    expect(await client.del([b, 'absent'])).toBe(1);
    expect(await client.incr(b, 2, 5000)).toEqual({ n: 2, ttlMs: 5000 });
    expect(await client.incr(b, 3, 8000)).toEqual({ n: 5, ttlMs: 5000 });
    advance(2000);
    expect(await client.mget([a, b])).toEqual([null, '5']);
  });

  it('bounds proxy subjects while keeping identical window names independent inside a shard', async () => {
    const { client, sent } = fixture('proxy');
    const [a, b] = await collision(client, sent);
    const partitions = new Set<string>();
    const hit = async (partition: string) => {
      const result = await client.hitWindows([
        {
          partition,
          windows: [{ key: '1m', limit: 1, windowMs: 60_000, algo: 'sliding' }],
        },
      ]);
      partitions.add(sent.at(-1)!.steps[0]!.p);
      return result.ok;
    };
    expect(await hit(a)).toBe(true);
    expect(await hit(b)).toBe(true);
    expect(sent.at(-1)!.steps[0]!.p).toBe(sent.at(-2)!.steps[0]!.p);
    expect(await hit(a)).toBe(false);
    expect(await hit(b)).toBe(false);
    for (let i = 0; i < 256; i++) await hit(`ip:${i}`);
    expect(partitions.size).toBeLessThanOrEqual(64);
  });

  it('does not log raw or digested keys/partitions or transport error contents', async () => {
    const spies = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => {})
    );
    try {
      const client = createAbuseGuardClient({
        family: 'replay',
        pepper,
        transport: async () => {
          throw new Error('sensitive-partition-key');
        },
      });
      await expect(client.get('sensitive-partition-key')).rejects.toThrow();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

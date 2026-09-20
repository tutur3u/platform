import type { UpstashRatelimitRedisClient } from '@tuturuuu/utils/upstash-rest';
import { v7 } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertRecentMeetingRequest,
  withMeetingRequest,
} from './meeting-request';

function memoryRedis() {
  const values = new Map<string, unknown>();
  const set = vi.fn(
    async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }
  );
  const get = vi.fn(async (key: string) => values.get(key) ?? null);
  const evalCommand = vi.fn(
    async (_script: string, keys: string[], args: unknown[]) => {
      if (values.get(keys[0]!) !== args[0]) return 0;
      if (keys.length === 1) values.delete(keys[0]!);
      else values.set(keys[1]!, JSON.parse(args[1] as string));
      return 1;
    }
  );
  return { values, set, get, eval: evalCommand, evalsha: vi.fn() };
}
let redis: ReturnType<typeof memoryRedis>;
let args: { id: string; hash: string; requestId: string };
const load = async () => redis as unknown as UpstashRatelimitRedisClient;
beforeEach(() => {
  redis = memoryRedis();
  args = {
    id: 'actor-workspace-bound-event',
    hash: 'payload-hash',
    requestId: v7(),
  };
});

describe('meeting delivery retry guard', () => {
  it('accepts recent UUIDv7 requests and rejects old/future/untimestamped identifiers', () => {
    const now = Date.now();
    expect(() =>
      assertRecentMeetingRequest(v7({ msecs: now }), now)
    ).not.toThrow();
    for (const request of [
      v7({ msecs: now - 16 * 60_000 }),
      v7({ msecs: now + 61_000 }),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]) {
      expect(() => assertRecentMeetingRequest(request, now)).toThrow();
    }
  });
  it('retains completion after the event is deleted instead of treating a retry as fresh', async () => {
    const states: unknown[] = [];
    await withMeetingRequest(
      args,
      async (state) => {
        states.push(state);
        return 'created';
      },
      load
    );
    await withMeetingRequest(
      args,
      async (state) => {
        states.push(state);
        return 'already handled';
      },
      load
    );
    expect(states).toEqual([
      { fresh: true, completed: false },
      { fresh: false, completed: true },
    ]);
    const recordCall = redis.set.mock.calls.find(
      ([key]) => !key.endsWith(':lease')
    );
    expect(recordCall?.[2]).toMatchObject({ ex: 7200 });
    expect(JSON.stringify([...redis.values.values()])).not.toContain('guest');
  });
  it('blocks simultaneous sends and keeps a pending record after ambiguous provider failure', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = withMeetingRequest(
      args,
      async () => {
        started();
        await pending;
        throw new Error('provider timeout');
      },
      load
    );
    await entered;
    const duplicate = vi.fn();
    await expect(
      withMeetingRequest(args, duplicate, load)
    ).rejects.toMatchObject({ status: 409 });
    expect(duplicate).not.toHaveBeenCalled();
    finish();
    await expect(first).rejects.toThrow('provider timeout');
    const retry = vi.fn(async () => 'reconciled');
    await withMeetingRequest(args, retry, load);
    expect(retry).toHaveBeenCalledWith({ fresh: false, completed: false });
  });
  it('rejects changed meeting details under the same identity', async () => {
    await withMeetingRequest(args, async () => 'created', load);
    const changed = vi.fn();
    await expect(
      withMeetingRequest({ ...args, hash: 'changed-guests' }, changed, load)
    ).rejects.toMatchObject({ status: 409 });
    expect(changed).not.toHaveBeenCalled();
  });
  it('fails closed when the store is missing, unavailable or corrupt', async () => {
    const send = vi.fn();
    await expect(
      withMeetingRequest(args, send, async () => null)
    ).rejects.toMatchObject({ status: 503 });
    redis.set.mockRejectedValueOnce(new Error('offline'));
    await expect(withMeetingRequest(args, send, load)).rejects.toThrow(
      'offline'
    );
    redis.values.set(`calendar:meeting-request:v1:${args.id}`, {
      hash: args.hash,
    });
    await expect(withMeetingRequest(args, send, load)).rejects.toMatchObject({
      status: 503,
    });
    expect(send).not.toHaveBeenCalled();
  });
  it('never removes another attempt lease after its own lease expires', async () => {
    await withMeetingRequest(
      args,
      async () => {
        redis.values.set(
          `calendar:meeting-request:v1:${args.id}:lease`,
          'new-owner'
        );
        return 'created';
      },
      load
    );
    expect(
      redis.values.get(`calendar:meeting-request:v1:${args.id}:lease`)
    ).toBe('new-owner');
    expect(redis.values.get(`calendar:meeting-request:v1:${args.id}`)).toEqual({
      hash: args.hash,
      completed: false,
    });
  });
});

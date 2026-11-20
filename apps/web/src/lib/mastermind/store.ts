import 'server-only';

import {
  configuredMastermindStore,
  type MastermindStore,
} from '@tuturuuu/utils/mastermind-store/client';
import {
  getUpstashRestRedisClient,
  type UpstashRestRedisClient,
} from '@tuturuuu/utils/upstash-rest';
import {
  COMPLETE_CLAIM_SCRIPT,
  RELEASE_CLAIM_SCRIPT,
} from './push-events/claims';

/**
 * Where Mastermind state lives: the Cloudflare Mastermind store Worker when
 * `MASTERMIND_STORE_URL` and `MASTERMIND_STORE_TOKEN` are set, otherwise a
 * legacy Upstash REST client when one is configured, otherwise nothing (the
 * routes answer 503). See apps/docs/build/devops/mastermind-store.mdx.
 */
export async function getMastermindStore(): Promise<MastermindStore | null> {
  const cloudflare = configuredMastermindStore();
  if (cloudflare) return cloudflare;
  const redis = await getUpstashRestRedisClient().catch(() => null);
  return redis ? upstashMastermindStore(redis) : null;
}

// Compare-and-set over Upstash for the legacy path; the Worker does it natively.
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == '0') or (current ~= false and ARGV[1] == '1' and current == ARGV[2]) then
  redis.call('SET', KEYS[1], ARGV[3], 'PX', ARGV[4])
  return 1
end
return 0`;

const CAD_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

const asText = (value: unknown) =>
  value == null
    ? null
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

export function upstashMastermindStore(
  redis: UpstashRestRedisClient
): MastermindStore {
  return {
    async get(key) {
      return asText(await redis.get(key));
    },
    async mget(keys) {
      return ((await redis.mget(...keys)) as unknown[]).map(asText);
    },
    async set(key, value, options) {
      const result = await redis.set(key, value, {
        px: options.ttlMs,
        ...(options.nx ? { nx: true } : {}),
      } as never);
      return result === 'OK';
    },
    async compareAndSet(key, expect, value, ttlMs) {
      return (
        Number(
          await redis.eval(
            CAS_SCRIPT,
            [key],
            [expect === null ? '0' : '1', expect ?? '', value, ttlMs]
          )
        ) === 1
      );
    },
    async compareAndDelete(key, expect) {
      return Number(await redis.eval(CAD_SCRIPT, [key], [expect])) === 1;
    },
    async del(key) {
      return Number(await redis.del(key)) > 0;
    },
  };
}

/** The Redis-shaped surface the push-event delivery code uses. */
export type MastermindPushRedis = Pick<
  UpstashRestRedisClient,
  'get' | 'set' | 'eval'
>;

/**
 * Push-event claims over the Mastermind store. Only the two claim scripts in
 * `push-events/claims.ts` are understood; anything else is refused.
 */
export function mastermindPushRedis(
  store: MastermindStore
): MastermindPushRedis {
  return {
    get: (async (key: string) => store.get(key)) as MastermindPushRedis['get'],
    set: (async (
      key: string,
      value: unknown,
      options?: { ex?: number; nx?: boolean }
    ) =>
      (await store.set(key, String(value), {
        ttlMs: (options?.ex ?? 24 * 60 * 60) * 1000,
        nx: options?.nx,
      }))
        ? 'OK'
        : null) as MastermindPushRedis['set'],
    eval: (async (script: string, keys: string[], args: unknown[]) => {
      const key = keys[0] ?? '';
      if (script === RELEASE_CLAIM_SCRIPT)
        return (await store.compareAndDelete(key, String(args[0]))) ? 1 : 0;
      if (script === COMPLETE_CLAIM_SCRIPT)
        return (await store.compareAndSet(
          key,
          String(args[0]),
          String(args[1]),
          Number(args[2]) * 1000
        ))
          ? 1
          : 0;
      throw new Error('Unsupported Mastermind store script');
    }) as MastermindPushRedis['eval'],
  };
}

/** Push-event state: the Cloudflare store when configured, else Upstash. */
export async function getMastermindPushRedis(): Promise<
  MastermindPushRedis | UpstashRestRedisClient | null
> {
  const cloudflare = configuredMastermindStore();
  if (cloudflare) return mastermindPushRedis(cloudflare);
  return getUpstashRestRedisClient().catch(() => null);
}

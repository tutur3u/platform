import { createHash } from 'node:crypto';
import type { NativeIntegrityStore } from '@tuturuuu/internal-api/native-integrity';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

const challengeSchema = z.object({
  id: z.string().min(1).max(128),
  actorId: z.string().min(1).max(128),
  method: z.enum(['GET', 'PATCH']),
  path: z.string().max(512),
  bodyHash: z.string().max(128),
  purpose: z.enum(['request', 'enroll']),
  keyId: z.string().max(1024).optional(),
  requestHash: z.string().max(128),
  expiresAt: z.number().int(),
});
const keySchema = z.object({
  actorId: z.string().min(1).max(128),
  publicKey: z.string().max(8192),
  counter: z.number().int().nonnegative(),
  platform: z.enum(['ios', 'macos']),
  environment: z.enum(['production', 'development']),
});
const scripts = {
  issue: `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if count > tonumber(ARGV[1]) then return 0 end
local hourly = redis.call('INCR', KEYS[2])
if hourly == 1 then redis.call('EXPIRE', KEYS[2], 3600) end
if hourly > 120 then return 0 end
local stored = redis.call('SET', KEYS[3], ARGV[3], 'PX', ARGV[4], 'NX')
if stored then return 1 else return 0 end`,
  consume: `local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value`,
  register: `local owner = redis.call('GET', KEYS[3])
if owner and owner ~= ARGV[5] then return 0 end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
if redis.call('ZCARD', KEYS[2]) >= 8 then return 0 end
local stored = redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3], 'NX')
if not stored then return 0 end
redis.call('SET', KEYS[3], ARGV[5], 'EX', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[4], KEYS[1])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1`,
  capability: `local capability = redis.call('GET', KEYS[2])
if capability then
  if capability ~= '1' then return redis.error_reply('invalid-native-capability') end
  return 1
end
local keys = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], '+inf', 'LIMIT', 0, 8)
for _, key in ipairs(keys) do if redis.call('EXISTS', key) == 1 then return 1 end end
return 0`,
  verifiedPlay: `redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
return 1`,
  revoke: `local keys = redis.call('ZRANGE', KEYS[1], 0, 7)
for _, key in ipairs(keys) do
  local value = redis.call('GET', key)
  if value then
    local record = cjson.decode(value)
    if record.ownerKey and redis.call('GET', record.ownerKey) == ARGV[1] then redis.call('DEL', record.ownerKey) end
  end
  redis.call('DEL', key)
end
redis.call('DEL', KEYS[1])
local play = redis.call('DEL', KEYS[2])
return #keys + play`,
  counter: `local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local record = cjson.decode(value)
if record.counter ~= tonumber(ARGV[1]) or tonumber(ARGV[2]) <= record.counter then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
record.counter = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(record), 'PX', ttl)
return 1`,
};

export type NativeIntegrityRedisAdapter = {
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
  get(key: string): Promise<unknown>;
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const prefix = 'native-integrity:v1:';
const keyRetentionSeconds = 90 * 24 * 60 * 60;
const actorKeyIndex = (actorId: string) =>
  `${prefix}actor-keys:${digest(actorId)}`;
const playCapability = (actorId: string) =>
  `${prefix}play-capability:${digest(actorId)}`;
const keyName = (actorId: string, keyId: string) =>
  `${prefix}key:${digest(`${actorId}\n${keyId}`)}`;
function storedValue(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export function createNativeIntegrityStore(
  redis: NativeIntegrityRedisAdapter,
  now = Date.now
): NativeIntegrityStore {
  return {
    async hasNativeCapability(actorId) {
      return (
        z
          .union([z.literal(0), z.literal(1)])
          .parse(
            await redis.eval(
              scripts.capability,
              [actorKeyIndex(actorId), playCapability(actorId)],
              [now()]
            )
          ) === 1
      );
    },
    async recordVerifiedPlayCapability(actorId) {
      const committed = await redis.eval(
        scripts.verifiedPlay,
        [playCapability(actorId)],
        [keyRetentionSeconds]
      );
      if (committed !== 1)
        throw new Error('Native capability persistence unavailable');
    },
    async issueChallenge(record, quota) {
      const ttl = Math.min(120_000, record.expiresAt - now());
      if (ttl <= 0) return false;
      const actor = digest(record.actorId);
      return (
        (await redis.eval(
          scripts.issue,
          [
            `${prefix}issue:${actor}`,
            `${prefix}hour:${actor}`,
            `${prefix}nonce:${digest(record.id)}`,
          ],
          [quota.limit, quota.windowSeconds, JSON.stringify(record), ttl]
        )) === 1
      );
    },
    async consumeChallenge(challengeId) {
      const value = await redis.eval(
        scripts.consume,
        [`${prefix}nonce:${digest(challengeId)}`],
        []
      );
      return value === null ? null : challengeSchema.parse(storedValue(value));
    },
    async getKey(actorId, keyId) {
      const value = await redis.get(keyName(actorId, keyId));
      if (value === null) return null;
      const record = keySchema.parse(storedValue(value));
      if (record.actorId !== actorId) return null;
      return record;
    },
    async registerKey(actorId, keyId, key) {
      if (key.actorId !== actorId || key.counter !== 0) return false;
      const ownerKey = `${prefix}owner:${digest(keyId)}`;
      return (
        (await redis.eval(
          scripts.register,
          [keyName(actorId, keyId), actorKeyIndex(actorId), ownerKey],
          [
            JSON.stringify({ ...key, ownerKey }),
            now(),
            keyRetentionSeconds,
            now() + keyRetentionSeconds * 1000,
            digest(actorId),
          ]
        )) === 1
      );
    },
    async advanceCounter(actorId, keyId, expectedCounter, nextCounter) {
      if (!Number.isSafeInteger(nextCounter) || nextCounter <= expectedCounter)
        return false;
      return (
        (await redis.eval(
          scripts.counter,
          [keyName(actorId, keyId)],
          [expectedCounter, nextCounter]
        )) === 1
      );
    },
  };
}

export function configuredNativeIntegrityStore() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    throw new Error('Native integrity store unavailable');
  return createNativeIntegrityStore(configuredNativeIntegrityRedis());
}

export function configuredNativeIntegrityRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    throw new Error('Native integrity store unavailable');
  return Redis.fromEnv({
    retry: false,
    signal: () => AbortSignal.timeout(4000),
    enableAutoPipelining: false,
  });
}

/** Bounded operator/account-deletion hook; callers must authorize actor deletion first. */
export async function revokeNativeIntegrityActorKeys(
  redis: NativeIntegrityRedisAdapter,
  actorId: string
) {
  return z
    .number()
    .int()
    .min(0)
    .max(9)
    .parse(
      await redis.eval(
        scripts.revoke,
        [actorKeyIndex(actorId), playCapability(actorId)],
        [digest(actorId)]
      )
    );
}

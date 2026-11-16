/**
 * Admission stores for the Live voice mint cap. Both evaluate the same
 * decision and return the same tuple, which the guard schema-validates:
 * - Durable Object (`live` family of the abuse-guard Worker), the target;
 * - Upstash Redis Lua, the legacy path for an unassigned family only.
 * An assigned but incomplete abuse-guard configuration is `off` and never
 * falls back to Upstash; both an `off` and a missing store fail closed.
 */
import { createHash } from 'node:crypto';
import type { AbuseGuardClient } from '@tuturuuu/utils/abuse-guard/client';
import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import { getUpstashRatelimitRedisClient } from '@tuturuuu/utils/upstash-rest';

export interface LiveMintStoreInput {
  actorId: string;
  mintId: string;
  actorLimit: number;
  concurrentLimit: number;
  durationMs: number;
  isFree: boolean;
  budgetLimit: number;
  rate: number;
}

/** Resolves to the decision tuple; the guard validates it before use. */
export interface LiveMintStore {
  reserve(input: LiveMintStoreInput): Promise<unknown>;
}

export interface LiveMintRedis {
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
}

/** The one Durable Object partition holding every actor row and the budget. */
export const LIVE_MINT_GUARD_PARTITION = 'live-mint:v2';
const LIVE_MINT_GUARD_BUDGET = 'free-budget';

// Redis TIME owns the rolling actor window and ICT calendar day. FREE expires at
// midnight rather than charging an unknown cross-day session to either budget.
// The reservation is the configured maximum lease cost, not client-reported use.
// No early refund exists until a trusted server-side end observation is qualified.
export const RESERVE_LIVE_MINT_SCRIPT = `
local clock = redis.call('TIME')
local ms = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local window = 86400000
local day = math.floor((ms + 25200000) / window)
local midnight = (day + 1) * window - 25200000
local actorLimit = tonumber(ARGV[1])
local concurrentLimit = tonumber(ARGV[2])
local durationMs = tonumber(ARGV[3])
local isFree = ARGV[4] == '1'
local member = ARGV[5]
local limit = tonumber(ARGV[6])
local rate = tonumber(ARGV[7])
local expires = ms + durationMs
if isFree then expires = math.min(expires, midnight) end
local reserve = 0
if isFree then reserve = math.floor((math.ceil((expires - ms) / 1000) * rate + 59) / 60) end
local budgetKey = KEYS[3] .. ':' .. tostring(day)
local spent = tonumber(redis.call('HGET', budgetKey, 'spent') or '0')
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ms - window)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ms)
local function retry(key, offset)
  local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  if #first < 2 then return 1 end
  return math.max(1, math.ceil((tonumber(first[2]) + offset - ms) / 1000))
end
if redis.call('ZCARD', KEYS[1]) >= actorLimit then return {0,'actor',retry(KEYS[1],window),spent,limit,0,day} end
if redis.call('ZCARD', KEYS[2]) >= concurrentLimit then return {0,'concurrency',retry(KEYS[2],0),spent,limit,0,day} end
if isFree and spent + reserve > limit then
  local alert = 0
  if redis.call('HSETNX', budgetKey, 'alert100', 'claimed') == 1 then alert = 2 end
  redis.call('PEXPIREAT', budgetKey, midnight + 172800000)
  return {0,'budget',math.max(1,math.ceil((midnight-ms)/1000)),spent,limit,alert,day}
end
local alert = 0
if isFree then
  spent = redis.call('HINCRBY', budgetKey, 'spent', reserve)
  if spent >= math.floor((limit * 4 + 4) / 5) and redis.call('HSETNX', budgetKey, 'alert80', 'claimed') == 1 then alert = alert + 1 end
  if spent >= limit and redis.call('HSETNX', budgetKey, 'alert100', 'claimed') == 1 then alert = alert + 2 end
  redis.call('PEXPIREAT', budgetKey, midnight + 172800000)
end
redis.call('ZADD', KEYS[1], ms, member)
redis.call('PEXPIRE', KEYS[1], window + 1000)
redis.call('ZADD', KEYS[2], expires + 30000, member)
redis.call('PEXPIRE', KEYS[2], durationMs + 31000)
return {1,ms,expires,reserve,spent,limit,alert,day}
`;
export function createRedisLiveMintStore(
  redis: LiveMintRedis,
  keyPrefix = 'live-mint:v2'
): LiveMintStore {
  return {
    reserve(input) {
      const actor = createHash('sha256').update(input.actorId).digest('hex');
      return redis.eval(
        RESERVE_LIVE_MINT_SCRIPT,
        [
          `${keyPrefix}:actor:${actor}`,
          `${keyPrefix}:leases:${actor}`,
          `${keyPrefix}:free-budget`,
        ],
        [
          input.actorLimit,
          input.concurrentLimit,
          input.durationMs,
          input.isFree ? '1' : '0',
          input.mintId,
          input.budgetLimit,
          input.rate,
        ]
      );
    },
  };
}

/**
 * The actor id leaves Web only as the client's peppered HMAC digest. The mint
 * id is the operation id, so an ambiguous duplicate can never charge twice.
 */
export function createGuardLiveMintStore(
  client: Pick<AbuseGuardClient, 'liveReserve'>
): LiveMintStore {
  return {
    async reserve(input) {
      const result = await client.liveReserve({
        partition: LIVE_MINT_GUARD_PARTITION,
        operationId: input.mintId,
        actor: input.actorId,
        budget: LIVE_MINT_GUARD_BUDGET,
        actorLimit: input.actorLimit,
        concurrentLimit: input.concurrentLimit,
        durationMs: input.durationMs,
        free: input.isFree,
        limit: input.budgetLimit,
        rate: input.rate,
      });
      return result.ok
        ? [
            1,
            result.at,
            result.expiresAt,
            result.reserved,
            result.spent,
            result.limit,
            result.alert,
            result.day,
          ]
        : [
            0,
            result.reason,
            result.retryAfterS,
            result.spent,
            result.limit,
            result.alert,
            result.day,
          ];
    },
  };
}

export async function getLiveMintStore(): Promise<LiveMintStore | null> {
  const selection = selectAbuseGuard('live');
  if (selection.kind === 'durable-object') {
    return createGuardLiveMintStore(selection.client);
  }
  if (selection.kind === 'off') return null;
  const redis = await getUpstashRatelimitRedisClient();
  return redis ? createRedisLiveMintStore(redis) : null;
}

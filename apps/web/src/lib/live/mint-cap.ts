import { createHash, randomUUID } from 'node:crypto';
import { getUpstashRatelimitRedisClient } from '@tuturuuu/utils/upstash-rest';
import { z } from 'zod';
import { sendLiveMintBudgetAlert } from './mint-cap-alerts';

export interface LiveMintConfig {
  freeSessionSeconds: number;
  actorDailyMints: number;
  dailyBudgetMicroUsd: number;
  usdPerMinuteMicroUsd: number;
  killSwitch: boolean;
  actorMaxConcurrent: number;
}
export class LiveMintCapError extends Error {
  constructor(
    readonly status: 429 | 503,
    readonly code: string,
    readonly retryAfter = 60
  ) {
    super('Live voice admission is unavailable.');
    this.name = 'LiveMintCapError';
  }
}
const configSchema = z.object({
  freeSessionSeconds: z.number().int().min(1).max(3600),
  actorDailyMints: z.number().int().min(1).max(100_000),
  dailyBudgetMicroUsd: z.number().int().min(1).max(1_000_000_000_000),
  usdPerMinuteMicroUsd: z.number().int().min(1).max(1_000_000_000),
  killSwitch: z.boolean(),
  actorMaxConcurrent: z.number().int().min(1).max(1000),
});
function integer(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value))
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  return Number(value);
}
function microUsd(value: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const whole = match[1];
  if (whole === undefined)
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const result = Number(
    BigInt(whole) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'))
  );
  if (!Number.isSafeInteger(result))
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  return result;
}
export function readLiveMintConfig(
  env: Record<string, string | undefined> = process.env
): LiveMintConfig {
  const kill = env.LIVE_MINT_KILL_SWITCH;
  if (kill !== undefined && kill !== 'true' && kill !== 'false')
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const parsed = configSchema.safeParse({
    freeSessionSeconds: integer(env.LIVE_FREE_SESSION_SECONDS, 180),
    actorDailyMints: integer(env.LIVE_ACTOR_DAILY_MINTS, 10),
    dailyBudgetMicroUsd: microUsd(env.LIVE_FREE_DAILY_USD_BUDGET ?? '50'),
    usdPerMinuteMicroUsd: microUsd(env.LIVE_FREE_USD_PER_MINUTE ?? '0.0368'),
    killSwitch: kill !== 'false',
    actorMaxConcurrent: integer(env.LIVE_ACTOR_MAX_CONCURRENT, 1),
  });
  if (!parsed.success)
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  return parsed.data;
}

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
const resultSchema = z.union([
  z.tuple([
    z.literal(1),
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().positive(),
    z.number().int().min(0).max(3),
    z.number().int().positive(),
  ]),
  z.tuple([
    z.literal(0),
    z.enum(['actor', 'budget', 'concurrency']),
    z.number().int().positive(),
    z.number().int().nonnegative(),
    z.number().int().positive(),
    z.number().int().min(0).max(3),
    z.number().int().positive(),
  ]),
]);
export interface LiveMintStore {
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
}
export interface LiveMintReservation {
  mintId: string;
  freeSessionSeconds: number;
  expiresAt: string;
  reservedMicroUsd: number;
}
export interface LiveMintBudgetAlert {
  threshold: 80 | 100;
  day: string;
  reservedMicroUsd: number;
  limitMicroUsd: number;
}
export function createLiveMintGuard({
  getStore = getUpstashRatelimitRedisClient,
  keyPrefix = 'live-mint:v2',
  alert = async (event: LiveMintBudgetAlert) => {
    await sendLiveMintBudgetAlert(event);
  },
}: {
  getStore?: () => Promise<LiveMintStore | null>;
  keyPrefix?: string;
  alert?: (event: LiveMintBudgetAlert) => Promise<void>;
} = {}) {
  return async function reserve({
    actorId,
    isFree,
    config = readLiveMintConfig(),
  }: {
    actorId: string;
    isFree: boolean;
    config?: LiveMintConfig;
  }): Promise<LiveMintReservation> {
    if (
      !configSchema.safeParse(config).success ||
      !z.string().uuid().safeParse(actorId).success
    ) {
      throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
    }
    if (config.killSwitch)
      throw new LiveMintCapError(503, 'LIVE_MINT_DISABLED');
    const actor = createHash('sha256').update(actorId).digest('hex');
    const mintId = randomUUID();
    let response: unknown;
    try {
      const store = await getStore();
      if (!store) throw new Error('Admission store missing');
      response = await store.eval(
        RESERVE_LIVE_MINT_SCRIPT,
        [
          `${keyPrefix}:actor:${actor}`,
          `${keyPrefix}:leases:${actor}`,
          `${keyPrefix}:free-budget`,
        ],
        [
          config.actorDailyMints,
          config.actorMaxConcurrent,
          (isFree ? config.freeSessionSeconds : 300) * 1000,
          isFree ? '1' : '0',
          mintId,
          config.dailyBudgetMicroUsd,
          config.usdPerMinuteMicroUsd,
        ]
      );
    } catch {
      throw new LiveMintCapError(503, 'LIVE_MINT_STORE_UNAVAILABLE');
    }
    const decision = resultSchema.safeParse(response);
    if (!decision.success)
      throw new LiveMintCapError(503, 'LIVE_MINT_STORE_INVALID');
    const value = decision.data;
    const alertMask = value[0] === 1 ? value[6] : value[5];
    const day = value[0] === 1 ? value[7] : value[6];
    const spent = value[0] === 1 ? value[4] : value[3];
    const limit = value[0] === 1 ? value[5] : value[4];
    for (const threshold of [80, 100] as const) {
      if ((alertMask & (threshold === 80 ? 1 : 2)) === 0) continue;
      try {
        await alert({
          threshold,
          day: new Date(day * 86400000).toISOString().slice(0, 10),
          reservedMicroUsd: spent,
          limitMicroUsd: limit,
        });
      } catch {
        // Claimed means no blind duplicate after failed/unknown outbound send.
        console.error('live_mint_budget_alert_delivery_failed', { threshold });
      }
    }
    if (value[0] === 0)
      throw new LiveMintCapError(
        429,
        value[1] === 'budget'
          ? 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'
          : `LIVE_MINT_${value[1].toUpperCase()}_LIMIT`,
        value[2]
      );
    return {
      mintId,
      freeSessionSeconds: config.freeSessionSeconds,
      expiresAt: new Date(value[2]).toISOString(),
      reservedMicroUsd: value[3],
    };
  };
}
export const reserveLiveMint = createLiveMintGuard();

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { NativeIntegrityRedisAdapter } from './store';

const reserveScript = `local used = tonumber(redis.call('GET', KEYS[2]) or '0')
local actor = tonumber(redis.call('GET', KEYS[3]) or '0')
if redis.call('GET', KEYS[1]) == '1' or used >= tonumber(ARGV[1]) or actor >= tonumber(ARGV[3]) then return {0,used,actor,0} end
used = redis.call('INCR', KEYS[2])
actor = redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[2])
local warning = 0
if used >= tonumber(ARGV[4]) and redis.call('SET', KEYS[4], '1', 'NX', 'EX', ARGV[2]) then warning = 1 end
return {1,used,actor,warning}`;
const reservationSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.union([z.literal(0), z.literal(1)]),
]);
function budgetValue(
  name: string,
  fallback: string,
  maximum: number,
  minimum = 1
) {
  const value = process.env[name] ?? fallback;
  if (!/^\d{1,6}$/.test(value)) return 0;
  const limit = Number(value);
  return limit >= minimum && limit <= maximum ? limit : 0;
}
export function budgetedNativeIntegrityFetch(
  redis: NativeIntegrityRedisAdapter,
  actorId: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now
): typeof fetch {
  const actorKey = createHash('sha256').update(actorId).digest('hex');
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    const permitted =
      (url.origin === 'https://oauth2.googleapis.com' &&
        url.pathname === '/token') ||
      (url.origin === 'https://playintegrity.googleapis.com' &&
        /^\/v1\/[A-Za-z][A-Za-z0-9_.]+:decodeIntegrityToken$/.test(
          url.pathname
        )) ||
      (url.origin === 'https://challenges.cloudflare.com' &&
        url.pathname === '/turnstile/v0/siteverify');
    const mode = process.env.NATIVE_INTEGRITY_MODE;
    const budget = budgetValue(
      'NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY',
      '1000',
      100_000,
      2
    );
    const actorBudget = Math.min(
      budgetValue('NATIVE_INTEGRITY_PROVIDER_BUDGET_ACTOR_DAY', '100', 10_000),
      Math.max(1, Math.floor(budget / 10))
    );
    if (
      !actorId ||
      actorId.length > 128 ||
      !permitted ||
      init?.method !== 'POST' ||
      (mode !== 'monitor' && mode !== 'enforce') ||
      process.env.NATIVE_INTEGRITY_PROVIDER_ENABLED === 'false' ||
      budget === 0 ||
      actorBudget === 0
    )
      throw new Error('Native integrity provider dispatch disabled');
    init.signal?.throwIfAborted();
    const time = now();
    const day = new Date(time).toISOString().slice(0, 10);
    const end = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
    const [reserved, used, , warning] = reservationSchema.parse(
      await redis.eval(
        reserveScript,
        [
          'native-integrity:v1:provider-stop',
          `native-integrity:v1:provider-budget:${day}`,
          `native-integrity:v1:provider-actor:${day}:${actorKey}`,
          `native-integrity:v1:provider-alert:${day}`,
        ],
        [
          budget,
          Math.ceil((end - time) / 1000) + 60,
          actorBudget,
          Math.max(1, Math.min(budget - 1, Math.ceil(budget * 0.8))),
        ]
      )
    );
    if (warning === 1)
      console.warn('native-integrity-provider-budget', {
        mode,
        limit: budget,
        used,
        remaining: budget - used,
      });
    if (reserved !== 1)
      throw new Error('Native integrity provider budget exhausted');
    const signal = AbortSignal.any([
      AbortSignal.timeout(5000),
      ...(init.signal ? [init.signal] : []),
    ]);
    signal.throwIfAborted();
    return fetchImpl(input, { ...init, redirect: 'error', signal });
  };
}

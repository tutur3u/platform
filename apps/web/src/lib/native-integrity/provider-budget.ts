import type { NativeIntegrityRedisAdapter } from './store';

const reserveScript = `if redis.call('GET', KEYS[1]) == '1' then return 0 end
local used = tonumber(redis.call('GET', KEYS[2]) or '0')
if used >= tonumber(ARGV[1]) then return 0 end
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1`;
function dailyBudget() {
  const value = process.env.NATIVE_INTEGRITY_PROVIDER_BUDGET_DAY ?? '1000';
  if (!/^\d{1,6}$/.test(value)) return 0;
  const limit = Number(value);
  return limit >= 1 && limit <= 100_000 ? limit : 0;
}
export function budgetedNativeIntegrityFetch(
  redis: NativeIntegrityRedisAdapter,
  fetchImpl: typeof fetch = fetch,
  now = Date.now
): typeof fetch {
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
    const budget = dailyBudget();
    if (
      !permitted ||
      init?.method !== 'POST' ||
      (mode !== 'monitor' && mode !== 'enforce') ||
      process.env.NATIVE_INTEGRITY_PROVIDER_ENABLED === 'false' ||
      budget === 0
    )
      throw new Error('Native integrity provider dispatch disabled');
    const time = now();
    const day = new Date(time).toISOString().slice(0, 10);
    const end = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
    const reserved = await redis.eval(
      reserveScript,
      [
        'native-integrity:v1:provider-stop',
        `native-integrity:v1:provider-budget:${day}`,
      ],
      [budget, Math.ceil((end - time) / 1000) + 60]
    );
    if (reserved !== 1)
      throw new Error('Native integrity provider budget exhausted');
    const signal = AbortSignal.any([
      AbortSignal.timeout(5000),
      ...(init.signal ? [init.signal] : []),
    ]);
    return fetchImpl(input, { ...init, redirect: 'error', signal });
  };
}

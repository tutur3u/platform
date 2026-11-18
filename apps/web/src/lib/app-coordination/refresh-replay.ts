import {
  isKnownReplay,
  preLimitReplayAttempt,
  rememberReplay,
} from '@tuturuuu/utils/abuse-guard/replay-guard';
import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';

export type RefreshConsumeResult =
  | 'consumed'
  | 'grace'
  | 'limited'
  | 'replayed'
  | 'revoked'
  | 'unavailable';

export type RefreshFamilyFence = {
  /** Store key marking the family revoked. */
  key: string;
  /** How long a revocation outlives the newest token the family can hold. */
  ttlSeconds: number;
};

/**
 * Consumes a refresh token's replay fence, allowing reuse within `graceSeconds`
 * of its first use. Known replays and over-limit callers cost no store
 * operation; only a first use proven outside grace is cached as replayed.
 * Store failures return `unavailable` and are reported through `onError`.
 *
 * With `family`, a token from a revoked family returns `revoked`, and a reuse
 * proven outside grace revokes the family so every later rotation of the
 * stolen chain fails too. `preLimit` replaces the default per-principal and
 * per-IP pre-limit keys for callers that already authenticated the client.
 */
export async function consumeRefreshTokenWithGrace({
  exp,
  family,
  graceSeconds,
  ip,
  jti,
  keyPrefix,
  onError,
  preLimit,
  sub,
}: {
  exp: number;
  family?: RefreshFamilyFence;
  graceSeconds: number;
  ip: string;
  jti: string;
  keyPrefix: string;
  onError: (error: unknown) => void;
  preLimit?: { ip: string | null; principal: string };
  sub: string;
}): Promise<RefreshConsumeResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = exp - nowSeconds;

  if (ttlSeconds <= 0 || !jti.trim() || !sub.trim()) {
    return 'replayed';
  }

  const key = `${keyPrefix}:${sub}:${jti}`;
  if (isKnownReplay(key)) return 'replayed';
  if (family && isKnownReplay(family.key)) return 'revoked';
  if (
    preLimitReplayAttempt(
      preLimit?.principal ?? sub,
      preLimit ? preLimit.ip : ip
    ) !== null
  ) {
    return 'limited';
  }

  const redis = await getUpstashRestRedisClient({
    family: 'replay',
    fairness: { principal: sub, source: guardSourceBucket(ip) },
  }).catch(() => null);
  if (!redis) {
    return 'unavailable';
  }

  try {
    if (family && (await redis.get(family.key)) != null) {
      rememberReplay(family.key, nowSeconds + family.ttlSeconds);
      return 'revoked';
    }

    const readFirstUse = async () => {
      const firstUsedAt = await redis.get<number | string>(key);
      return typeof firstUsedAt === 'number'
        ? firstUsedAt
        : Number.parseInt(firstUsedAt ?? '', 10);
    };
    const judge = async (
      firstUsedAtSeconds: number
    ): Promise<RefreshConsumeResult> => {
      if (firstUsedAtSeconds + graceSeconds >= nowSeconds) return 'grace';
      rememberReplay(key, exp);
      if (family) {
        await redis.set(family.key, String(nowSeconds), {
          ex: family.ttlSeconds,
        });
        rememberReplay(family.key, nowSeconds + family.ttlSeconds);
      }
      return 'replayed';
    };

    const firstUsedAtSeconds = await readFirstUse();
    if (Number.isFinite(firstUsedAtSeconds)) {
      return await judge(firstUsedAtSeconds);
    }

    const consumed = await redis.set(key, String(nowSeconds), {
      ex: ttlSeconds,
      nx: true,
    });
    if (consumed === 'OK') return 'consumed';

    // A concurrent request won the claim: apply grace to its timestamp. An
    // unreadable winner is replayed without caching, so a retry re-checks.
    const winnerSeconds = await readFirstUse();
    return Number.isFinite(winnerSeconds)
      ? await judge(winnerSeconds)
      : 'replayed';
  } catch (error) {
    onError(error);
    return 'unavailable';
  }
}

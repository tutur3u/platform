import {
  isKnownReplay,
  preLimitReplayAttempt,
  rememberReplay,
} from '@tuturuuu/utils/abuse-guard/replay-guard';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';

export type RefreshConsumeResult =
  | 'consumed'
  | 'grace'
  | 'limited'
  | 'replayed'
  | 'unavailable';

/**
 * Consumes a refresh token's replay fence, allowing reuse within `graceSeconds`
 * of its first use. Known replays and over-limit callers cost no store
 * operation; only a first use proven outside grace is cached as replayed.
 * Store failures return `unavailable` and are reported through `onError`.
 */
export async function consumeRefreshTokenWithGrace({
  exp,
  graceSeconds,
  ip,
  jti,
  keyPrefix,
  onError,
  sub,
}: {
  exp: number;
  graceSeconds: number;
  ip: string;
  jti: string;
  keyPrefix: string;
  onError: (error: unknown) => void;
  sub: string;
}): Promise<RefreshConsumeResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = exp - nowSeconds;

  if (ttlSeconds <= 0 || !jti.trim() || !sub.trim()) {
    return 'replayed';
  }

  const key = `${keyPrefix}:${sub}:${jti}`;
  if (isKnownReplay(key)) return 'replayed';
  if (preLimitReplayAttempt(sub, ip) !== null) return 'limited';

  const redis = await getUpstashRestRedisClient({
    family: 'replay',
  }).catch(() => null);
  if (!redis) {
    return 'unavailable';
  }

  try {
    const readFirstUse = async () => {
      const firstUsedAt = await redis.get<number | string>(key);
      return typeof firstUsedAt === 'number'
        ? firstUsedAt
        : Number.parseInt(firstUsedAt ?? '', 10);
    };
    const judge = (firstUsedAtSeconds: number): RefreshConsumeResult => {
      if (firstUsedAtSeconds + graceSeconds >= nowSeconds) return 'grace';
      rememberReplay(key, exp);
      return 'replayed';
    };

    const firstUsedAtSeconds = await readFirstUse();
    if (Number.isFinite(firstUsedAtSeconds)) return judge(firstUsedAtSeconds);

    const consumed = await redis.set(key, String(nowSeconds), {
      ex: ttlSeconds,
      nx: true,
    });
    if (consumed === 'OK') return 'consumed';

    // A concurrent request won the claim: apply grace to its timestamp. An
    // unreadable winner is replayed without caching, so a retry re-checks.
    const winnerSeconds = await readFirstUse();
    return Number.isFinite(winnerSeconds) ? judge(winnerSeconds) : 'replayed';
  } catch (error) {
    onError(error);
    return 'unavailable';
  }
}

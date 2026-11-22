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

/**
 * A caller's decision on a token the fence has not proven replayed: `admit`
 * lets the claim proceed, `refuse` revokes the family, and `unavailable`
 * answers without recording a first use, so a retry is judged afresh.
 */
export type RefreshAdmission = 'admit' | 'refuse' | 'unavailable';

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
 *
 * `admit` runs after the pre-limit and the family check, before the first use
 * is recorded (and again for a retry inside the grace). A proven replay never
 * reaches it, so its cost is paid only by first uses and retries. That cost is
 * bounded per principal only while the `replay` guard family is assigned,
 * because the pre-limit applies only then.
 */
export async function consumeRefreshTokenWithGrace({
  admit,
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
  admit?: () => Promise<RefreshAdmission>;
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
    // A proven refusal must not turn into a retryable `unavailable` when the
    // revocation write fails.
    const revokeFamily = async () => {
      if (!family) return;
      try {
        await redis.set(family.key, String(nowSeconds), {
          ex: family.ttlSeconds,
        });
        rememberReplay(family.key, nowSeconds + family.ttlSeconds);
      } catch (error) {
        onError(error);
      }
    };
    /** Null when the caller admits the token. */
    const decide = async (): Promise<RefreshConsumeResult | null> => {
      const admission = admit ? await admit() : 'admit';
      if (admission === 'unavailable') return 'unavailable';
      if (admission === 'refuse') {
        await revokeFamily();
        return 'revoked';
      }
      return null;
    };
    const judge = async (
      firstUsedAtSeconds: number,
      admitted = false,
      atSeconds = nowSeconds
    ): Promise<RefreshConsumeResult> => {
      if (firstUsedAtSeconds + graceSeconds >= atSeconds) {
        return (admitted ? null : await decide()) ?? 'grace';
      }
      rememberReplay(key, exp);
      await revokeFamily();
      return 'replayed';
    };

    const firstUsedAtSeconds = await readFirstUse();
    if (Number.isFinite(firstUsedAtSeconds)) {
      return await judge(firstUsedAtSeconds);
    }

    const decision = await decide();
    if (decision) return decision;

    // The claim time is taken after the grant check, so slow lookups cannot
    // widen the window in which two overlapping requests both count as grace.
    const claimSeconds = Math.floor(Date.now() / 1000);
    const consumed = await redis.set(key, String(claimSeconds), {
      ex: ttlSeconds,
      nx: true,
    });
    if (consumed === 'OK') return 'consumed';

    // A concurrent request won the claim: apply grace to its timestamp. An
    // unreadable winner is replayed without caching, so a retry re-checks.
    const winnerSeconds = await readFirstUse();
    return Number.isFinite(winnerSeconds)
      ? await judge(winnerSeconds, true, claimSeconds)
      : 'replayed';
  } catch (error) {
    onError(error);
    return 'unavailable';
  }
}

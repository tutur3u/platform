import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getUpstashRestRedisClient } from './upstash-rest';

export const AI_TEMP_AUTH_HEADER = 'x-tuturuuu-ai-temp-auth';
export const AI_TEMP_AUTH_TTL_SECONDS = 60;
export const AI_CREDIT_SNAPSHOT_TTL_SECONDS = 15;

const USER_VERSION_TTL_SECONDS = 24 * 60 * 60;
const CREDIT_SNAPSHOT_MAX_AGE_MS = AI_CREDIT_SNAPSHOT_TTL_SECONDS * 1000;
const MINIMUM_SNAPSHOT_REMAINING_CREDITS = 50;

type AiTempAuthUser = {
  id: string;
  email?: string | null;
};

export type AiTempAuthContext = {
  user: AiTempAuthUser;
  wsId?: string;
  creditWsId?: string;
  creditSource?: 'personal' | 'workspace';
};

type AiTempAuthPayload = AiTempAuthContext & {
  tokenId: string;
  authVersion: string;
  issuedAt: number;
  expiresAt: number;
};

export type AiTempAuthValidationResult =
  | { status: 'missing' }
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'valid'; context: AiTempAuthContext };

export type AiCreditSnapshot = {
  remainingCredits: number;
  maxOutputTokens: number | null;
  tier: string;
  allowedModels: string[];
  allowedFeatures: string[];
  dailyLimit: number | null;
  updatedAt: number;
};

function tokenKey(digest: string) {
  return `ai:temp-auth:token:${digest}`;
}

function userVersionKey(userId: string) {
  return `ai:temp-auth:user-version:${userId}`;
}

function creditSnapshotKey({ wsId, userId }: { wsId: string; userId: string }) {
  return `ai:credits:snapshot:${wsId}:${userId}`;
}

function creditInFlightKey({ wsId, userId }: { wsId: string; userId: string }) {
  return `ai:credits:in-flight:${wsId}:${userId}`;
}

function digestToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getBearerToken(request: Pick<Request, 'headers'>) {
  const value = request.headers.get(AI_TEMP_AUTH_HEADER);
  return value?.trim() || null;
}

function isPayload(value: unknown): value is AiTempAuthPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<AiTempAuthPayload>;

  return (
    typeof payload.tokenId === 'string' &&
    typeof payload.authVersion === 'string' &&
    typeof payload.issuedAt === 'number' &&
    typeof payload.expiresAt === 'number' &&
    !!payload.user &&
    typeof payload.user === 'object' &&
    typeof payload.user.id === 'string'
  );
}

export async function mintAiTempAuthToken({
  user,
  wsId,
  creditWsId,
  creditSource,
}: AiTempAuthContext): Promise<{
  token: string;
  expiresAt: number;
} | null> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return null;

  const authVersion =
    (
      await redis.get<string>(userVersionKey(user.id)).catch(() => null)
    )?.toString() ?? '0';
  const tokenId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const token = `${tokenId}.${secret}`;
  const now = Date.now();
  const expiresAt = now + AI_TEMP_AUTH_TTL_SECONDS * 1000;

  const payload: AiTempAuthPayload = {
    tokenId,
    user: { id: user.id, email: user.email ?? null },
    ...(wsId ? { wsId } : {}),
    ...(creditWsId ? { creditWsId } : {}),
    ...(creditSource ? { creditSource } : {}),
    authVersion,
    issuedAt: now,
    expiresAt,
  };

  try {
    await redis.set(tokenKey(digestToken(token)), payload, {
      ex: AI_TEMP_AUTH_TTL_SECONDS,
    });
  } catch {
    return null;
  }

  return { token, expiresAt };
}

export async function validateAiTempAuthRequest(
  request: Pick<Request, 'headers'>
): Promise<AiTempAuthValidationResult> {
  const token = getBearerToken(request);
  if (!token) return { status: 'missing' };

  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return { status: 'unavailable' };

  const payload = await redis
    .get<AiTempAuthPayload>(tokenKey(digestToken(token)))
    .catch(() => null);
  if (!isPayload(payload)) return { status: 'invalid' };

  if (payload.expiresAt <= Date.now()) {
    return { status: 'expired' };
  }

  const currentVersion =
    (
      await redis.get<string>(userVersionKey(payload.user.id)).catch(() => null)
    )?.toString() ?? '0';
  if (currentVersion !== payload.authVersion) {
    return { status: 'revoked' };
  }

  return {
    status: 'valid',
    context: {
      user: payload.user,
      ...(payload.wsId ? { wsId: payload.wsId } : {}),
      ...(payload.creditWsId ? { creditWsId: payload.creditWsId } : {}),
      ...(payload.creditSource ? { creditSource: payload.creditSource } : {}),
    },
  };
}

export async function revokeUserAiTempAuthTokens(
  userId: string
): Promise<boolean> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return false;

  try {
    await redis.incr(userVersionKey(userId));
    await redis.expire(userVersionKey(userId), USER_VERSION_TTL_SECONDS);
    return true;
  } catch {
    return false;
  }
}

export async function writeAiCreditSnapshot({
  wsId,
  userId,
  snapshot,
}: {
  wsId: string;
  userId: string;
  snapshot: AiCreditSnapshot;
}): Promise<boolean> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return false;

  try {
    await redis.set(creditSnapshotKey({ wsId, userId }), snapshot, {
      ex: AI_CREDIT_SNAPSHOT_TTL_SECONDS,
    });
    return true;
  } catch {
    return false;
  }
}

export async function readAiCreditSnapshot({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}): Promise<AiCreditSnapshot | null> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return null;

  const snapshot = await redis
    .get<AiCreditSnapshot>(creditSnapshotKey({ wsId, userId }))
    .catch(() => null);
  return snapshot ?? null;
}

export async function invalidateAiCreditSnapshot({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}): Promise<boolean> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return false;

  try {
    await redis.del(creditSnapshotKey({ wsId, userId }));
    return true;
  } catch {
    return false;
  }
}

export async function incrementAiCreditChargeInFlight({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}): Promise<boolean> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return false;

  try {
    const key = creditInFlightKey({ wsId, userId });
    await redis.incr(key);
    await redis.expire(key, AI_TEMP_AUTH_TTL_SECONDS);
    return true;
  } catch {
    return false;
  }
}

export async function decrementAiCreditChargeInFlight({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}): Promise<boolean> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return false;

  try {
    const key = creditInFlightKey({ wsId, userId });
    const value = await redis.decr(key);
    if (Number(value) <= 0) {
      await redis.del(key);
    }
    return true;
  } catch {
    return false;
  }
}

export async function hasAiCreditChargeInFlight({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}): Promise<boolean> {
  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return false;

  try {
    const value = await redis.get<number | string>(
      creditInFlightKey({ wsId, userId })
    );
    return Number(value ?? 0) > 0;
  } catch {
    return false;
  }
}

export function isAiCreditSnapshotUsable(
  snapshot: AiCreditSnapshot | null | undefined,
  options: { inFlight?: boolean; now?: number } = {}
): snapshot is AiCreditSnapshot {
  if (!snapshot) return false;
  if (options.inFlight) return false;
  if (snapshot.remainingCredits < MINIMUM_SNAPSHOT_REMAINING_CREDITS) {
    return false;
  }

  const now = options.now ?? Date.now();
  return now - snapshot.updatedAt <= CREDIT_SNAPSHOT_MAX_AGE_MS;
}

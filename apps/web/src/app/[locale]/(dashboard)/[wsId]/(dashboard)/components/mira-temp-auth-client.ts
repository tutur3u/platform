'use client';

import { AI_TEMP_AUTH_HEADER } from '@tuturuuu/utils/ai-temp-auth-constants';
import type { CreditSource } from './mira-chat-constants';

export type MiraTempAuthBody = {
  wsId?: string;
  creditWsId?: string;
  creditSource?: CreditSource;
};

type CachedTempAuthToken = {
  cacheKey: string;
  token: string;
  expiresAt: number;
};

let cachedToken: CachedTempAuthToken | null = null;
let generation = 0;
let inFlight: {
  cacheKey: string;
  promise: Promise<Record<string, string>>;
} | null = null;

function getCacheKey(body: MiraTempAuthBody) {
  return JSON.stringify({
    wsId: body.wsId ?? null,
    creditWsId: body.creditWsId ?? null,
    creditSource: body.creditSource ?? null,
  });
}

export async function getMiraTempAuthHeaders(
  body: MiraTempAuthBody
): Promise<Record<string, string>> {
  const started = performance.now();
  const cacheKey = getCacheKey(body);
  if (
    cachedToken?.cacheKey === cacheKey &&
    cachedToken.expiresAt > Date.now() + 5_000
  ) {
    performance.measure('mira:temp-auth-cache-hit', { start: started });
    return { [AI_TEMP_AUTH_HEADER]: cachedToken.token };
  }

  if (inFlight) {
    const pending = inFlight;
    const headers = await pending.promise;
    if (pending.cacheKey === cacheKey) return headers;
    return getMiraTempAuthHeaders(body);
  }

  const requestGeneration = generation;
  const promise = requestToken(body, cacheKey, requestGeneration, started);
  inFlight = { cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}

async function requestToken(
  body: MiraTempAuthBody,
  cacheKey: string,
  requestGeneration: number,
  started: number
): Promise<Record<string, string>> {
  try {
    const response = await fetch('/api/ai/temp-auth/token', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wsId: body.wsId,
        creditWsId: body.creditWsId,
        creditSource: body.creditSource,
      }),
    });

    if (!response.ok) {
      cachedToken = null;
      return {};
    }

    const payload = (await response.json()) as {
      token?: string | null;
      expiresAt?: number | null;
    };

    if (requestGeneration !== generation) return {};

    if (!payload.token || !payload.expiresAt) {
      cachedToken = null;
      return {};
    }

    cachedToken = {
      cacheKey,
      token: payload.token,
      expiresAt: payload.expiresAt,
    };

    return { [AI_TEMP_AUTH_HEADER]: payload.token };
  } catch {
    cachedToken = null;
    return {};
  } finally {
    performance.measure('mira:temp-auth-cache-miss', { start: started });
  }
}

export async function prefetchMiraTempAuth(body: MiraTempAuthBody) {
  await getMiraTempAuthHeaders(body);
  return cachedToken?.cacheKey === getCacheKey(body)
    ? cachedToken.expiresAt
    : null;
}

export async function revokeMiraTempAuthToken() {
  generation++;
  cachedToken = null;
  try {
    await fetch('/api/ai/temp-auth/revoke', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
    });
  } catch {
    // Revocation is best-effort on the client; Redis TTL still expires tokens.
  }
}

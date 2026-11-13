'use client';

import { AI_TEMP_AUTH_HEADER } from '@tuturuuu/utils/ai-temp-auth-constants';
import type { CreditSource } from './mira-chat-constants';

type MiraTempAuthBody = {
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

export async function revokeMiraTempAuthToken() {
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

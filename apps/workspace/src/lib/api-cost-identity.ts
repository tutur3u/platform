import { createHash } from 'node:crypto';
import { validateApiKey } from '@tuturuuu/auth/api-keys';
import {
  APP_SESSION_SCOPE,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { resolveSupabaseSessionRequest } from '@tuturuuu/auth/supabase-session-user';
import { reserveSecurityBudget } from '@tuturuuu/storage-core/security-budget';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { PRODUCTION_INTERNAL_APP_DOMAINS } from '@tuturuuu/utils/internal-domains';
import type { NextRequest } from 'next/server';

const cache = new Map<
  string,
  { expiresAt: number; value: Promise<string | undefined> }
>();

/** Uplift is tied to verified credentials, never a caller-supplied user ID. */
export async function resolveApiCostUserId(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const provider =
    /^Bearer\s+eyJ/iu.test(authorization) ||
    (!authorization &&
      request.cookies
        .getAll()
        .some(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/u.test(name)));
  if (provider) {
    const credential = createHash('sha256')
      .update(authorization || request.headers.get('cookie') || '')
      .digest('hex');
    const entry = cache.get(credential);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    cache.delete(credential);
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    const value = (async () => {
      const minute = Math.floor(Date.now() / 60_000);
      const ip = createHash('sha256')
        .update(extractIPFromHeaders(request.headers))
        .digest('hex');
      const result = await reserveSecurityBudget([
        [`api-cost:v1:identity:${minute}`, 1, 2000, 120],
        [`api-cost:v1:identity-ip:${ip}:${minute}`, 1, 120, 120],
      ]);
      if (result[0] !== 1) return undefined;
      const { user, authError } = await resolveSupabaseSessionRequest(request);
      return !authError &&
        user &&
        !(user.banned_until && Date.parse(user.banned_until) > Date.now())
        ? user.id
        : undefined;
    })();
    const cached = { expiresAt: Date.now() + 30_000, value };
    cache.set(credential, cached);
    try {
      return await value;
    } catch (error) {
      if (cache.get(credential) === cached) cache.delete(credential);
      throw error;
    }
  }

  const app = verifyAppSessionRequest(request, {
    requiredScope: APP_SESSION_SCOPE,
    targetApp: PRODUCTION_INTERNAL_APP_DOMAINS.map(({ name }) => name),
  });
  return app.ok ? app.claims.sub : undefined;
}

export interface ApiCostIdentity {
  userId?: string;
  workspaceId?: string;
  keyId?: string;
}
const machineCache = new Map<
  string,
  { expiresAt: number; value: Promise<ApiCostIdentity> }
>();

export async function resolveApiCostIdentity(
  request: NextRequest
): Promise<ApiCostIdentity> {
  const key = (request.headers.get('authorization') ?? '')
    .replace(/^Bearer\s+/iu, '')
    .trim();
  if (!/^ttr_(?!app_)/u.test(key)) {
    const userId = await resolveApiCostUserId(request);
    return userId ? { userId } : {};
  }
  const hash = createHash('sha256').update(key).digest('hex');
  const existing = machineCache.get(hash);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  machineCache.delete(hash);
  if (machineCache.size >= 256)
    machineCache.delete(machineCache.keys().next().value!);
  const value = (async () => {
    const minute = Math.floor(Date.now() / 60_000);
    const ip = createHash('sha256')
      .update(extractIPFromHeaders(request.headers))
      .digest('hex');
    const result = await reserveSecurityBudget([
      [`api-cost:v1:identity:${minute}`, 1, 2000, 120],
      [`api-cost:v1:identity-ip:${ip}:${minute}`, 1, 120, 120],
    ]);
    if (result[0] !== 1) return {};
    const context = await validateApiKey(key);
    return context ? { workspaceId: context.wsId, keyId: context.keyId } : {};
  })();
  const entry = { expiresAt: Date.now() + 30_000, value };
  machineCache.set(hash, entry);
  try {
    return await value;
  } catch (error) {
    if (machineCache.get(hash) === entry) machineCache.delete(hash);
    throw error;
  }
}

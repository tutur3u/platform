import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildAbuseRiskSubjects: vi.fn(),
  checkRateLimit: vi.fn(),
  checkUserSuspension: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  enforceAdaptiveStepUpChallenge: vi.fn(),
  extractIPFromHeaders: vi.fn(),
  getAdaptiveRateLimitConfig: vi.fn(),
  hasAuthenticatedApiSession: vi.fn(),
  isBackendRateLimitError: vi.fn(),
  isIPBlocked: vi.fn(),
  recordApiAuthFailure: vi.fn(),
  recordResponseAbuseSignal: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveWebAbuseDecision: vi.fn(),
  setLogDrainUserContext: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  buildAbuseRiskSubjects: mocks.buildAbuseRiskSubjects,
  extractIPFromHeaders: mocks.extractIPFromHeaders,
  isIPBlocked: mocks.isIPBlocked,
  recordApiAuthFailure: mocks.recordApiAuthFailure,
}));

vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  isBackendRateLimitError: mocks.isBackendRateLimitError,
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeVerifiedSessionCacheForSubjects:
    mocks.writeVerifiedSessionCacheForSubjects,
}));

vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: mocks.checkUserSuspension,
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: mocks.validateAiTempAuthRequest,
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: mocks.hasAuthenticatedApiSession,
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  MAX_PAYLOAD_SIZE: 1024 * 1024,
  MAX_BIO_LENGTH: 1000,
  MAX_DISPLAY_NAME_LENGTH: 100,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: mocks.enforceAdaptiveStepUpChallenge,
  getAdaptiveRateLimitConfig: mocks.getAdaptiveRateLimitConfig,
  recordResponseAbuseSignal: mocks.recordResponseAbuseSignal,
  resolveWebAbuseDecision: mocks.resolveWebAbuseDecision,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  setLogDrainUserContext: mocks.setLogDrainUserContext,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('next/server', async (load) => ({
  ...(await load<object>()),
  connection: async () => {},
}));

import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { PATCH } from '../profile/route';
import { DELETE } from './route';

const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const ticket = '00000000-0000-4000-8000-000000000003';
const origin = 'https://storage.example.test';
const path = `${actor}/${ticket}.webp`;
const otherPath = `${other}/${ticket}.webp`;
const url = (p: string, storageOrigin = origin) =>
  `${storageOrigin}/storage/v1/object/public/avatars/${p}`;
const rows = new Map<string, string | null>();
const objects = new Set<string>();
const remove = vi.fn();
const storageFrom = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const writes = vi.fn();
const readError = vi.fn();
const updateError = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', 'synthetic-avatar-route-secret');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
  vi.stubEnv('SUPABASE_SERVER_URL', '');
  vi.stubEnv('SUPABASE_PUBLIC_STORAGE_ORIGIN', '');
  rows.clear();
  rows.set(actor, url(path));
  rows.set(other, url(otherPath));
  objects.clear();
  objects.add(path);
  objects.add(otherPath);
  readError.mockReturnValue(null);
  updateError.mockReturnValue(null);
  from.mockImplementation((table: string) => {
    expect(table).toBe('users');
    return {
      select: () => ({
        eq: (key: string, id: string) => {
          expect(key).toBe('id');
          return {
            single: async () => ({
              data: { avatar_url: rows.get(id) },
              error: readError(),
            }),
          };
        },
      }),
      update: (patch: { avatar_url: string | null }) => ({
        eq: async (key: string, id: string) => {
          expect(key).toBe('id');
          writes(id, patch);
          if (!updateError()) rows.set(id, patch.avatar_url);
          return { error: updateError() };
        },
      }),
    };
  });
  remove.mockImplementation(async (paths: string[]) => {
    for (const p of paths) objects.delete(p);
    return { error: null };
  });
  storageFrom.mockReturnValue({ remove });
  rpc.mockImplementation(
    async (
      name: string,
      args: { p_user_id: string; p_patch: { avatar_url: string | null } }
    ) => {
      expect(name).toBe('update_public_user_profile');
      rows.set(args.p_user_id, args.p_patch.avatar_url);
      return { error: null };
    }
  );
  const client = { from, rpc, storage: { from: storageFrom } };
  mocks.createAdminClient.mockResolvedValue(client);
  mocks.createClient.mockResolvedValue(client);
  mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
    user: { id: actor },
    authError: null,
  });
  mocks.buildAbuseRiskSubjects.mockReturnValue([]);
  mocks.extractIPFromHeaders.mockReturnValue('203.0.113.1');
  mocks.isIPBlocked.mockResolvedValue(null);
  mocks.getAdaptiveRateLimitConfig.mockReturnValue({
    config: { windowMs: 60000, maxRequests: 100 },
  });
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 100,
    headers: {},
  });
  mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
  mocks.resolveWebAbuseDecision.mockResolvedValue({
    tier: 'normal',
    subjects: [],
    reasons: [],
    trustMultiplier: 1,
  });
  mocks.enforceAdaptiveStepUpChallenge.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

function request(transport: string, method: string, value?: string | null) {
  const { token } = createAppSessionToken({ userId: actor, targetApp: 'nova' });
  const headers: Record<string, string> =
    transport === 'satellite bearer'
      ? { authorization: `Bearer ${token}` }
      : { cookie: 'synthetic-supabase-session=actor' };
  return new NextRequest(
    `https://app.test/api/v1/users/me/${method === 'PATCH' ? 'profile' : 'avatar'}`,
    {
      method,
      headers,
      ...(method === 'PATCH'
        ? { body: JSON.stringify({ avatar_url: value, user_id: other }) }
        : {}),
    }
  );
}

function unsafeManagedUrls(storageOrigin: string) {
  const ownUrl = url(path, storageOrigin);
  const { host, port } = new URL(storageOrigin);
  const portVariant = port
    ? storageOrigin.replace(`:${port}`, `:0${port}`)
    : `${storageOrigin}:443`;
  return [
    url(otherPath, storageOrigin),
    url(`${actor}/../${otherPath}`, storageOrigin),
    url(`${actor}/%2e%2e/${otherPath}`, storageOrigin),
    url(`${actor}/%252e%252e/${otherPath}`, storageOrigin),
    url(`${actor}/%2E%2E%2F${otherPath}`, storageOrigin),
    url(`${actor}//${ticket}.webp`, storageOrigin),
    url(`/${path}`, storageOrigin),
    ownUrl.replace('/avatars/', '/banners/'),
    `${ownUrl}?download=1`,
    `${ownUrl}#avatar`,
    `${ownUrl}?`,
    `${ownUrl}#`,
    url(`${actor}/%30${ticket.slice(1)}.webp`, storageOrigin),
    ownUrl.replace('/avatars/', '/%61vatars/'),
    url(`${actor}/subdirectory/${ticket}.webp`, storageOrigin),
    url(`${actor}/1700000000000.png`, storageOrigin),
    ownUrl.replace('https://', 'https://user:pass@'),
    ownUrl.replace('https://', 'HTTPS://'),
    ownUrl.replace(host, host.toUpperCase()),
    url(path, portVariant),
    ` ${ownUrl}`,
    `${ownUrl}\n`,
  ];
}

const unsafe = [
  ...unsafeManagedUrls(origin),
  'https://oauth.example.test/picture.png',
  url(path, 'https://foreign.example.test'),
  'not a URL',
];

describe.each(['web cookie', 'satellite bearer'])(
  'avatar ownership over %s',
  (transport) => {
    it.each(unsafe)('clears without deletion for %s', async (value) => {
      rows.set(actor, value);
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
      expect(rows.get(actor)).toBeNull();
      expect(rows.get(other)).toBe(url(otherPath));
      expect(objects.has(otherPath)).toBe(true);
      expect(objects.has(path)).toBe(true);
      expect(storageFrom).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(writes).toHaveBeenCalledWith(actor, { avatar_url: null });
    });
    it('deletes only the owner ticket object after clearing the profile', async () => {
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
      expect(rows.get(actor)).toBeNull();
      expect(objects.has(path)).toBe(false);
      expect(objects.has(otherPath)).toBe(true);
      expect(storageFrom).toHaveBeenCalledWith('avatars');
      expect(remove).toHaveBeenCalledExactlyOnceWith([path]);
      expect(writes.mock.invocationCallOrder[0]).toBeLessThan(
        remove.mock.invocationCallOrder[0] ?? 0
      );
      if (transport === 'web cookie')
        expect(mocks.createAdminClient).not.toHaveBeenCalled();
      else expect(mocks.createClient).not.toHaveBeenCalled();
    });
    it('clears an empty profile without storage access', async () => {
      rows.set(actor, null);
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
      expect(remove).not.toHaveBeenCalled();
    });
    it('does not delete when profile reading fails', async () => {
      readError.mockReturnValue({ code: 'XX000' });
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
      expect(remove).not.toHaveBeenCalled();
    });
    it('does not delete when profile clearing fails', async () => {
      updateError.mockReturnValue({ code: 'XX000' });
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(500);
      expect(objects.has(path)).toBe(true);
      expect(remove).not.toHaveBeenCalled();
    });
    it.each(unsafeManagedUrls(origin))(
      'rejects managed PATCH URL %s',
      async (value) => {
        expect((await PATCH(request(transport, 'PATCH', value))).status).toBe(
          400
        );
        expect(rpc).not.toHaveBeenCalled();
        expect(rows.get(actor)).toBe(url(path));
      }
    );
    it.each([url(path), 'https://oauth.example.test/photo.png?size=100', null])(
      'preserves supported PATCH value %s',
      async (value) => {
        expect((await PATCH(request(transport, 'PATCH', value))).status).toBe(
          200
        );
        expect(rows.get(actor)).toBe(value);
        expect(rows.get(other)).toBe(url(otherPath));
        expect(rpc).toHaveBeenCalledWith('update_public_user_profile', {
          p_user_id: actor,
          p_patch: { avatar_url: value },
        });
        expect(remove).not.toHaveBeenCalled();
      }
    );
    it('uses the configured public storage origin', async () => {
      vi.stubEnv(
        'SUPABASE_PUBLIC_STORAGE_ORIGIN',
        'https://public.example.test'
      );
      rows.set(actor, url(path).replace(origin, 'https://public.example.test'));
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
      expect(remove).toHaveBeenCalledExactlyOnceWith([path]);
    });
    describe.each([
      'https://public.example.test',
      'https://server.example.test:8443',
      origin,
    ])('with distinct configured origins at %s', (configuredOrigin) => {
      beforeEach(() => {
        vi.stubEnv(
          'SUPABASE_PUBLIC_STORAGE_ORIGIN',
          'https://public.example.test'
        );
        vi.stubEnv('SUPABASE_SERVER_URL', 'https://server.example.test:8443');
      });

      it('accepts the exact own URL and deletes only its ticket', async () => {
        const value = url(path, configuredOrigin);
        expect((await PATCH(request(transport, 'PATCH', value))).status).toBe(
          200
        );
        expect(rows.get(actor)).toBe(value);
        expect(rows.get(other)).toBe(url(otherPath));
        expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
        expect(rows.get(actor)).toBeNull();
        expect(objects.has(otherPath)).toBe(true);
        expect(remove).toHaveBeenCalledExactlyOnceWith([path]);
      });

      it.each(unsafeManagedUrls(configuredOrigin))(
        'rejects managed PATCH and prevents deletion for %s',
        async (value) => {
          expect((await PATCH(request(transport, 'PATCH', value))).status).toBe(
            400
          );
          expect(rpc).not.toHaveBeenCalled();
          expect(rows.get(actor)).toBe(url(path));
          rows.set(actor, value);
          expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
          expect(rows.get(actor)).toBeNull();
          expect(objects.has(path)).toBe(true);
          expect(objects.has(otherPath)).toBe(true);
          expect(remove).not.toHaveBeenCalled();
        }
      );
    });
    it('clears without deletion if storage configuration is invalid', async () => {
      vi.stubEnv(
        'SUPABASE_PUBLIC_STORAGE_ORIGIN',
        'https://public.example.test/invalid'
      );
      expect((await DELETE(request(transport, 'DELETE'))).status).toBe(200);
      expect(rows.get(actor)).toBeNull();
      expect(remove).not.toHaveBeenCalled();
    });
  }
);
it('rejects a forged satellite token before accessing profile or storage', async () => {
  const response = await DELETE(
    new NextRequest('https://app.test/api/v1/users/me/avatar', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ttr_app_invalid' },
    })
  );
  expect(response.status).toBe(401);
  expect(from).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

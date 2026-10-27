import { randomBytes } from 'node:crypto';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  SUPERVISOR,
  WS,
} from './topic-schedule/schedule-fixture.test-helper';

const mocks = vi.hoisted(() => ({
  admin: null as ReturnType<typeof createScheduleFixture> | null,
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
  createClient: vi.fn(async () => ({})),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async () => ({ user: null })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async (wsId: string) => wsId,
  getSecret: (name: string, rows: { name: string; value: string }[]) =>
    rows.find((row) => row.name === name),
  getSecrets: async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
  ],
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  buildAbuseRiskSubjects: () => [],
  extractIPFromHeaders: () => '127.0.0.1',
  isIPBlocked: vi.fn(),
  recordApiAuthFailure: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  isBackendRateLimitError: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: vi.fn(),
}));
vi.mock('@tuturuuu/utils/constants', () => ({ MAX_PAYLOAD_SIZE: 1024 * 1024 }));
vi.mock('@/lib/abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: vi.fn(),
  getAdaptiveRateLimitConfig: vi.fn(),
  recordResponseAbuseSignal: vi.fn(),
  resolveWebAbuseDecision: vi.fn(),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));

// Session parsing, configured audience checks and signature verification are real.
import { GET } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/contacts/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    'TUTURUUU_APP_COORDINATION_SECRET',
    randomBytes(32).toString('hex')
  );
  mocks.admin = createScheduleFixture();
  mocks.permissions.mockImplementation(
    async ({ user, wsId }: { user?: { id: string }; wsId: string }) =>
      user?.id === SUPERVISOR && wsId === WS
        ? {
            withoutPermission: (permission: string) =>
              permission !== 'manage_users',
          }
        : null
  );
});
afterEach(() => vi.unstubAllEnvs());

describe.each(['cookie', 'bearer'] as const)(
  'topic Contacts audience over %s',
  (transport) => {
    it.each(['contacts', 'tasks', 'storefront', 'platform'] as const)(
      '%s credentials retain the topic audience boundary',
      async (targetApp) => {
        const identity = { userId: SUPERVISOR, email: 'fixture@example.test' };
        const token =
          targetApp === 'platform'
            ? createCliAppSession(identity).access.token
            : createAppSessionToken({ ...identity, targetApp }).token;
        const request = new Request(
          `https://web.example.test/api/v1/workspaces/${WS}/topic-announcements/contacts`,
          {
            headers: {
              origin: 'https://contacts.example.test',
              ...(transport === 'cookie'
                ? { cookie: `${APP_SESSION_COOKIE_NAME}=${token}` }
                : { authorization: `Bearer ${token}` }),
            },
          }
        );
        // Every negative control is a valid signed credential for its own app.
        expect(verifyAppSessionRequest(request, { targetApp }).ok).toBe(true);
        const response = await GET(request, {
          params: Promise.resolve({ wsId: WS }),
        });
        expect(response.status).toBe(targetApp === 'contacts' ? 200 : 401);
        if (targetApp === 'contacts') {
          expect((await response.json()).data).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'Anna' })])
          );
          expect(mocks.permissions).toHaveBeenCalledWith({
            user: expect.objectContaining({ id: SUPERVISOR }),
            wsId: WS,
          });
        } else {
          expect(mocks.permissions).not.toHaveBeenCalled();
        }
      }
    );
  }
);

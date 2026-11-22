import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allowedScopes: [] as string[],
  binding: vi.fn(),
  getExternalAppById: vi.fn(),
  member: vi.fn(),
  permissions: vi.fn(),
}));
const wsId = '11111111-1111-4111-8111-111111111111';
const EXPANDED = [
  'external-projects:manage',
  'external-projects:publish',
  'external-projects:read',
];

vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: () => 'ttr_app_bearer',
  verifyAppCoordinationToken: () => ({
    claims: {
      email: 'editor@example.com',
      iat: Math.floor(Date.now() / 1000),
      scopes: EXPANDED,
      sub: 'user-1',
      target_app: 'fysh',
      workspace_id: wsId,
    },
    ok: true,
  }),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: () => null,
  verifyAppSessionRequest: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: mocks.member,
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
  verifyExternalAppSecret: vi.fn(),
}));
vi.mock('./binding-state', () => ({
  getDefaultCanonicalExternalProjectId: vi.fn(),
  resolveWorkspaceExternalProjectBinding: mocks.binding,
}));
vi.mock('./store', () => ({}));

import { requireWorkspaceExternalProjectAccess } from './access';
import { requireWorkspaceExternalProjectManageDecision } from './manage-decision';

const request = () =>
  new Request(`https://tuturuuu.com/api/v1/workspaces/${wsId}/cms`, {
    headers: { Authorization: 'Bearer ttr_app_bearer' },
  });

function grant(allowedScopes: string[]) {
  mocks.getExternalAppById.mockResolvedValue({
    allowedScopes,
    allowedWorkspaceIds: [wsId],
    enabled: true,
    id: 'fysh',
    secretIssuedAt: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.mockResolvedValue({
    containsPermission: () => true,
    withoutPermission: () => false,
  });
  mocks.member.mockResolvedValue({ membershipType: 'MEMBER', ok: true });
  mocks.binding.mockResolvedValue({
    canonical_project: { adapter: 'custom', id: 'fysh' },
    enabled: true,
  });
});

describe('external-project exact manage grant', () => {
  it('refuses a manage scope expanded from external-projects:*', async () => {
    grant(['external-projects:*']);

    const decision = await requireWorkspaceExternalProjectManageDecision(
      request(),
      wsId
    );

    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.response.status).toBe(403);
  });

  it('allows an explicit grant and applies a revocation on the next call', async () => {
    grant(['external-projects:manage']);
    expect(
      (await requireWorkspaceExternalProjectManageDecision(request(), wsId)).ok
    ).toBe(true);

    grant(['external-projects:*']);
    expect(
      (await requireWorkspaceExternalProjectManageDecision(request(), wsId)).ok
    ).toBe(false);
  });

  it.each([[['external-projects:*']], [['external-projects:manage']]])(
    'keeps ordinary manage access for a %j grant',
    async (allowedScopes) => {
      grant(allowedScopes);

      const access = await requireWorkspaceExternalProjectAccess({
        mode: 'manage',
        request: request(),
        wsId,
      });

      expect(access.ok).toBe(true);
    }
  );
});

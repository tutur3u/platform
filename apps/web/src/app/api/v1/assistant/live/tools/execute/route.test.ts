import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  temp: vi.fn(),
  membership: vi.fn(),
  permissions: vi.fn(),
  tier: vi.fn(),
  factory: vi.fn(),
  bridge: vi.fn(),
  context: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: m.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: m.session,
}));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: m.temp,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
  resolveWorkspaceIdForPrincipal: async ({ wsId }: { wsId: string }) => wsId,
  verifyWorkspaceMembershipType: m.membership,
  getPermissions: m.permissions,
  getWorkspaceTier: m.tier,
}));
vi.mock('@tuturuuu/ai/tools/workspace-context', () => ({
  resolveWorkspaceContextState: m.context,
}));
vi.mock('@tuturuuu/ai/tools/mira-tools', () => ({
  createMiraStreamTools: m.factory,
}));
vi.mock('@/lib/live/canonical-tool-bridge', () => ({
  runCanonicalLiveTool: m.bridge,
}));
vi.mock('@/lib/feature-tiers', () => ({
  isFeatureAvailable: (_feature: string, tier: string) => tier === 'PRO',
}));
const body = {
  wsId: 'workspace',
  functionName: 'execute_workspace_tool',
  args: { toolName: 'create_task', argumentsJson: '{}' },
  toolCallId: 'provider-id',
};
const request = (value: unknown = body) =>
  new Request('https://example.test/api/v1/assistant/live/tools/execute', {
    method: 'POST',
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.temp.mockResolvedValue({ status: 'absent' });
  m.session.mockResolvedValue({ user: { id: 'actor' } });
  m.membership.mockResolvedValue({ ok: true });
  m.permissions.mockResolvedValue({ withoutPermission: () => false });
  m.tier.mockResolvedValue('PRO');
  m.context.mockResolvedValue({ wsId: 'workspace' });
  m.factory.mockReturnValue({ canonical: true });
  m.bridge.mockResolvedValue({ ok: true });
  m.admin.mockResolvedValue({ admin: true });
});
describe('canonical Live execution authorization', () => {
  it('dispatches only through the permission-aware canonical factory and preserves provider IDs', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(m.bridge).toHaveBeenCalledWith(
      { canonical: true },
      body.functionName,
      body.args,
      'provider-id'
    );
    const ctx = m.factory.mock.calls[0]![0];
    expect(await ctx.authorizeWorkspaceTools('other-workspace', [])).toBe(
      false
    );
    expect(await ctx.authorizeWorkspaceTools('workspace', ['read_tasks'])).toBe(
      true
    );
  });
  it.each(['revoked', 'unauthenticated', 'membership', 'tier', 'permissions'])(
    'does not dispatch when %s verification fails',
    async (reason) => {
      if (reason === 'revoked') m.temp.mockResolvedValue({ status: 'revoked' });
      if (reason === 'unauthenticated')
        m.session.mockResolvedValue({ user: null });
      if (reason === 'membership')
        m.membership.mockResolvedValue({ ok: false });
      if (reason === 'tier') m.tier.mockResolvedValue('FREE');
      if (reason === 'permissions') m.permissions.mockResolvedValue(null);
      expect((await POST(request())).status).toBeGreaterThanOrEqual(400);
      expect(m.factory).not.toHaveBeenCalled();
      expect(m.bridge).not.toHaveBeenCalled();
    }
  );
  it('pins opaque temporary credentials to the verified workspace', async () => {
    m.temp.mockResolvedValue({
      status: 'valid',
      context: { user: { id: 'temp-actor' }, wsId: 'different' },
    });
    expect((await POST(request())).status).toBe(403);
    expect(m.bridge).not.toHaveBeenCalled();
  });
  it('rejects malformed bodies before authentication or dispatch', async () => {
    expect((await POST(request({ ...body, toolCallId: '' }))).status).toBe(400);
    expect(m.session).not.toHaveBeenCalled();
    expect(m.bridge).not.toHaveBeenCalled();
  });
});

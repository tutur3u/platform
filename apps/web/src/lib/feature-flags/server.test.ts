import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isFeatureEnabled: typeof import('./server').isFeatureEnabled;

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  membership: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

const user = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-11-25T00:00:00Z',
};
const workspaceId = 'bbbbbbbb-0000-4000-8000-000000000001';
const key = 'MEET_UX_V2';
const supabase = { auth: { getUser: mocks.getUser } };

beforeEach(async () => {
  vi.resetModules();
  ({ isFeatureEnabled } = await import('./server'));
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue(supabase);
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.createAdminClient.mockResolvedValue({
    schema: () => ({
      rpc: (name: string, args: unknown) => ({
        abortSignal: (signal: AbortSignal) => mocks.rpc(name, args, signal),
      }),
    }),
  });
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data: {
      environment: args.p_environment,
      version: '0123456789abcdef0123456789abcdef',
      rules:
        name === 'feature_flag_read_snapshot'
          ? [
              {
                flagKey: key,
                scope: 'platform',
                subjectId: null,
                mode: 'staff',
                revision: 1,
              },
            ]
          : [],
    },
  }));
});

afterEach(() => vi.unstubAllEnvs());

describe('web runtime feature flags', () => {
  it('passes verified server identity and membership into the RPC reader', async () => {
    expect(
      await isFeatureEnabled(key, { workspaceId: workspaceId.toUpperCase() })
    ).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.membership).toHaveBeenCalledWith({
      supabase,
      userId: user.id,
      wsId: workspaceId,
      requiredType: 'ANY',
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'feature_flag_read_subject_rules',
      expect.objectContaining({
        p_workspace_id: workspaceId,
        p_user_id: user.id,
      }),
      expect.any(AbortSignal)
    );
  });

  it('creates one service client for every read in the isolate', async () => {
    await isFeatureEnabled(key, { workspaceId });
    await isFeatureEnabled(key, { workspaceId });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
  });

  it('creates the service client again after a failed creation', async () => {
    mocks.createAdminClient.mockRejectedValueOnce(new Error('no env'));
    expect(await isFeatureEnabled(key, { workspaceId })).toBe(false);
    await isFeatureEnabled(key, { workspaceId });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(2);
  });

  it('rejects unverified actor and workspace contexts before reading the rule store', async () => {
    const request = new Request('https://example.test/api', {
      method: 'POST',
      body: JSON.stringify({ userId: user.id, workspaceId }),
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({ ok: false });
    expect(await isFeatureEnabled(key, { request, workspaceId })).toBe(false);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(request);

    mocks.membership.mockResolvedValue({ ok: false });
    expect(await isFeatureEnabled(key, { workspaceId })).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns off if the private subject RPC is unavailable', async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: 'unavailable' },
      data: null,
    });
    expect(await isFeatureEnabled(key, { workspaceId })).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'feature_flag_read_subject_rules',
      expect.objectContaining({ p_user_id: user.id }),
      expect.any(AbortSignal)
    );
  });
});

import { expect, it, vi } from 'vitest';
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: vi.fn(),
}));
const ID = '00000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), audit: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      in: async () => ({
        data: [{ id: '00000000-0000-4000-8000-000000000001', feedback: '   ' }],
        error: null,
      }),
    };
    return { schema: () => ({ from: () => query, rpc: mocks.rpc }) };
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifySecret: async () => true,
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: async () => ({
    containsPermission: () => true,
  }),
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'ws',
  resolveRequestActorAuthUid: async () => 'actor',
}));
vi.mock('./group-read-access', () => ({
  getReportReadGroupIds: async () => null,
}));
vi.mock('./held-reports', async (load) => {
  const actual = await load<typeof import('./held-reports')>();
  return {
    ...actual,
    loadHeldReportIds: async () => ['00000000-0000-4000-8000-000000000001'],
    heldAuditTable: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: mocks.audit,
      };
      return q;
    },
  };
});
vi.mock('./resend-reports', async (load) => ({
  ...(await load<typeof import('./resend-reports')>()),
  loadResendCandidates: async () => [
    {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'failed',
      reason: 'failed',
    },
  ],
}));
import { POST as held } from './held/route';
import { POST as resend } from './resend/route';
it.each(['held', 'resend'])(
  'refuses an empty-feedback %s batch before queue/audit writes',
  async (kind) => {
    vi.clearAllMocks();
    const payload = {
      expectedCount: 1,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      ...(kind === 'held'
        ? { action: 'send', groupId: ID }
        : { target: 'selection', reportIds: [ID] }),
    };
    const handler = kind === 'held' ? held : resend;
    const response = await handler(
      new Request('https://example.invalid/api', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ wsId: 'ws' }) }
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'REPORT_FEEDBACK_REQUIRED',
      emptyCount: 1,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  }
);

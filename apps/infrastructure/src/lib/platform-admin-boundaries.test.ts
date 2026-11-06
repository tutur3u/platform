import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  membershipType: 'MEMBER' as string | undefined,
  permissions: new Set<string>(),
  actor: { user: { id: 'staff', email: 'staff@tuturuuu.com' }, admin: {} },
  admin: { rpc: vi.fn().mockResolvedValue({ error: null }) },
  snapshot: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: vi.fn(async () => mocks.actor.user),
}));
vi.mock('@tuturuuu/utils/email/staff-session', () => ({
  isVerifiedTuturuuuStaffSession: vi.fn(() => true),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: vi.fn(async () => mocks.actor),
  resolveSatellitePageActor: vi.fn(async () => mocks.actor),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () => ({
    membershipType: mocks.membershipType,
    containsPermission: (p: string) => mocks.permissions.has(p),
    withoutPermission: (p: string) => !mocks.permissions.has(p),
  })),
  enforceRootWorkspaceAdmin: vi.fn(async () => undefined),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureRootMemberRequest: vi.fn(
    async (p = 'view_infrastructure') =>
      mocks.permissions.has(p)
        ? { ok: true, user: mocks.actor.user, sbAdmin: mocks.admin }
        : { ok: false, response: Response.json({}, { status: 403 }) }
  ),
  authorizeInfrastructureAdminRequest: vi.fn(
    async (p = 'view_infrastructure') =>
      mocks.permissions.has(p)
        ? { ok: true, user: mocks.actor.user, sbAdmin: mocks.admin }
        : { ok: false, response: Response.json({}, { status: 403 }) }
  ),
}));
vi.mock('@/lib/devboxes/admin-store', () => ({
  listDevboxControlSnapshot: mocks.snapshot,
}));
vi.mock('@/lib/devboxes/authorization', () => ({
  authorizeDevboxRootMember: vi.fn(async () => ({ ok: true })),
  authorizeDevboxRootViewer: vi.fn(async () => ({
    ok: false,
    response: Response.json({}, { status: 403 }),
  })),
}));
vi.mock('@/lib/infrastructure/projects', () => ({
  syncInfrastructureProject: mocks.sync,
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: async (_context: unknown, run: () => Promise<unknown>) =>
    run(),
}));
vi.mock(
  '@/app/api/v1/infrastructure/monitoring/blue-green/authorization',
  () => ({
    authorizeInfrastructureViewer: vi.fn(async () => ({ ok: true })),
    authorizeInfrastructureOperator: vi.fn(async () => ({
      ok: false,
      response: Response.json({}, { status: 403 }),
    })),
  })
);

const req = () =>
  new NextRequest('http://localhost/api/test', {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membershipType = 'MEMBER';
  mocks.permissions.clear();
  mocks.permissions.add('view_infrastructure');
  mocks.actor.admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { platform_user_id: 'staff' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
});

describe('platform administration permission boundaries', () => {
  it('SR-223 denies email-only whitelist access and permits root operators', async () => {
    const { hasAIWhitelistAccess } = await import(
      './ai-whitelist/authorization'
    );
    expect(await hasAIWhitelistAccess(req())).toBe(false);
    mocks.permissions.add('manage_workspace_roles');
    expect(await hasAIWhitelistAccess(req())).toBe(true);
  });
  it('SR-224 denies email-only cron access and permits secret managers', async () => {
    const { getManagedCronAdminUser } = await import(
      './managed-cron/authorization'
    );
    expect(await getManagedCronAdminUser(req())).toBeNull();
    mocks.permissions.add('manage_workspace_secrets');
    expect(await getManagedCronAdminUser(req())).toEqual(mocks.actor.user);
  });
  it('SR-225 rejects root links without the queue read permission', async () => {
    mocks.permissions.clear();
    const { requirePostEmailQueueRootAdmin } = await import(
      '@/app/api/v1/infrastructure/post-email-queue/auth'
    );
    const result = await requirePostEmailQueueRootAdmin(req());
    expect(result.error?.status).toBe(403);
  });
  it('SR-252 denies snapshots to root members without viewer access', async () => {
    const { GET } = await import('@/app/api/v1/infrastructure/devboxes/route');
    expect((await GET(req())).status).toBe(403);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it('SR-251 denies project sync to viewers before accessing GitHub', async () => {
    const { POST } = await import(
      '@/app/api/v1/infrastructure/projects/[projectId]/sync/route'
    );
    expect(
      (await POST(req(), { params: Promise.resolve({ projectId: 'project' }) }))
        .status
    ).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('SR-228 rejects entity-limit mutations for root viewers before the RPC', async () => {
    const { addPlatformEntityCreationLimitTable } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/entity-creation-limits/actions'
    );
    const form = new FormData();
    form.set('targetTable', 'tasks');
    await expect(
      addPlatformEntityCreationLimitTable(
        '00000000-0000-0000-0000-000000000000',
        form
      )
    ).rejects.toThrow();
    expect(mocks.admin.rpc).not.toHaveBeenCalled();
  });
});

describe.each([
  ['balances', 'POST'],
  ['allocations', 'PUT'],
  ['features', 'PUT'],
  ['models', 'PATCH'],
  ['sync-models', 'POST'],
])('SR-226 AI-credit %s', (path, method) => {
  it('rejects viewers before a mutation', async () => {
    const route = await import(`../app/api/v1/admin/ai-credits/${path}/route`);
    const response = await route[method](req());
    expect(response.status).toBe(403);
  });
});

describe.each([
  ['blocked-ips', 'POST'],
  ['blocked-ips', 'DELETE'],
  ['otp-limits/reset', 'POST'],
  ['email-blacklist', 'POST'],
  ['email-blacklist/[entryId]', 'PUT'],
  ['email-blacklist/[entryId]', 'DELETE'],
])('SR-226 abuse control %s %s', (path, method) => {
  it('rejects viewers before changing security controls', async () => {
    const route = await import(`../app/api/v1/infrastructure/${path}/route`);
    const response = await route[method](req(), {
      params: Promise.resolve({ entryId: 'entry' }),
    });
    expect(response.status).toBe(403);
  });
});

it('SR-225 rejects viewer-triggered queue drains before processing', async () => {
  const { requirePostEmailQueueRootAdmin } = await import(
    '@/app/api/v1/infrastructure/post-email-queue/auth'
  );
  expect(
    (await requirePostEmailQueueRootAdmin(req(), 'manage_workspace_roles'))
      .error?.status
  ).toBe(403);
  mocks.permissions.add('manage_workspace_roles');
  expect(
    (await requirePostEmailQueueRootAdmin(req(), 'manage_workspace_roles')).user
  ).toEqual(mocks.actor.user);
});

it('SR-228 retains root alias admission for authorized entity-limit operators', async () => {
  mocks.permissions.add('manage_workspace_roles');
  const { addPlatformEntityCreationLimitTable } = await import(
    '@/app/[locale]/(dashboard)/[wsId]/entity-creation-limits/actions'
  );
  const form = new FormData();
  form.set('targetTable', 'tasks');
  await expect(
    addPlatformEntityCreationLimitTable('internal', form)
  ).resolves.toEqual({ status: 'table-added' });
  expect(mocks.admin.rpc).toHaveBeenCalledOnce();
});

describe.each(['GUEST', undefined])('root membership %s', (membershipType) => {
  it('denies whitelist and cron even with permissions', async () => {
    mocks.membershipType = membershipType;
    mocks.permissions.add('manage_workspace_roles');
    mocks.permissions.add('manage_workspace_secrets');
    const { hasAIWhitelistAccess } = await import(
      './ai-whitelist/authorization'
    );
    const { getManagedCronAdminUser } = await import(
      './managed-cron/authorization'
    );
    expect(await hasAIWhitelistAccess(req())).toBe(false);
    expect(await getManagedCronAdminUser(req())).toBeNull();
  });
});

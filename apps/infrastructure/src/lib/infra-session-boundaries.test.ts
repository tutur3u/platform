import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  metrics: vi.fn(),
  logs: vi.fn(),
  rpc: vi.fn(async () => ({ data: true, error: null })),
  admin: vi.fn(),
  user: { id: 'staff', email: 'staff@tuturuuu.com' },
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.actor,
  resolveSatellitePageActor: mocks.actor,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ withoutPermission: () => false }),
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: async () => ({
    ok: false,
    response: Response.json({}, { status: 403 }),
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  suspendUser: vi.fn(),
  liftSuspension: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (request: Request, context: unknown, params: unknown) => unknown
    ) =>
    (request: Request, params: unknown) =>
      handler(
        request,
        { user: mocks.user, supabase: { rpc: mocks.rpc } },
        params
      ),
  resolveSessionAuthContext: async () => ({ ok: true, user: mocks.user }),
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/calendar-sync/data-fetching',
  () => ({
    getSyncMetrics: mocks.metrics,
    getSyncLogs: mocks.logs,
  })
);
const req = () =>
  new NextRequest('http://localhost/api/test', { method: 'POST', body: '{}' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(null);
  mocks.metrics.mockResolvedValue({ successRate: 0, avgDurationMs: 0 });
  mocks.logs.mockResolvedValue({ logs: [], totalCount: 0 });
});

describe('SR-253 Infrastructure actor boundary', () => {
  it('requires the infra actor before checking AI-agent permissions', async () => {
    const { requireAiAgentAdmin } = await import(
      '@/app/api/v1/infrastructure/ai-agents/access'
    );
    const result = await requireAiAgentAdmin(req());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('denies an unresolved infra actor at suspension reads', async () => {
    const { GET } = await import(
      '@/app/api/v1/infrastructure/suspensions/route'
    );
    expect((await GET(req(), {})).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('denies an unresolved infra actor at suspension writes', async () => {
    const { POST } = await import(
      '@/app/api/v1/infrastructure/suspensions/route'
    );
    expect((await POST(req(), {})).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('denies an unresolved infra actor at suspension removal', async () => {
    const { DELETE } = await import(
      '@/app/api/v1/infrastructure/suspensions/[id]/route'
    );
    expect((await DELETE(req(), { params: { id: 'suspension' } })).status).toBe(
      401
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('denies unresolved infra actors before fetching calendar metrics', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/calendar-sync/route'
    );
    expect(
      (await GET(req(), { params: Promise.resolve({ wsId: 'workspace' }) }))
        .status
    ).toBe(401);
    expect(mocks.metrics).not.toHaveBeenCalled();
    expect(mocks.logs).not.toHaveBeenCalled();
  });
  it('requires an administrative permission for STT', async () => {
    const { POST } = await import(
      '@/app/api/v1/infrastructure/ai/stt/modal/route'
    );
    expect((await POST(req())).status).toBe(403);
  });
});

it('requires an infra actor for calendar data helpers used by pages', async () => {
  const { getSyncMetrics, getSyncLogs } = await vi.importActual<
    typeof import('@/app/[locale]/(dashboard)/[wsId]/calendar-sync/data-fetching')
  >('@/app/[locale]/(dashboard)/[wsId]/calendar-sync/data-fetching');
  await expect(getSyncMetrics('workspace')).rejects.toThrow('Unauthorized');
  await expect(getSyncLogs('workspace')).rejects.toThrow('Unauthorized');
});

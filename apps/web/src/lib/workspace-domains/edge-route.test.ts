import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveDomain: vi.fn(),
  binding: vi.fn(),
  payload: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@/lib/external-projects/access', () => ({
  resolveWorkspaceExternalProjectBinding: mocks.binding,
}));
vi.mock('@/lib/external-projects/store', () => ({
  buildWorkspaceExternalProjectDeliveryPayload: mocks.payload,
}));
vi.mock('./resolve', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resolve')>()),
  resolveWorkspaceDomain: mocks.resolveDomain,
}));

const { handleWorkspaceDomainEdgeRequest } = await import('./edge-route');

const SECRET = 'e'.repeat(40);
const call = (kind: 'resolve' | 'site', secret: string | null = SECRET) =>
  handleWorkspaceDomainEdgeRequest(
    new Request(
      'https://tuturuuu.com/api/v1/workspace-domains/site?host=example.com',
      { headers: secret ? { 'X-Workspace-Domains-Edge-Secret': secret } : {} }
    ),
    kind
  );

beforeEach(() => {
  vi.stubEnv('WORKSPACE_DOMAINS_EDGE_SECRET', SECRET);
  mocks.binding.mockResolvedValue({ enabled: true, canonical_project: {} });
  mocks.payload.mockResolvedValue({ revision: 'r1', collections: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('workspace domain edge routes', () => {
  it('is unavailable without a configured secret and rejects bad secrets', async () => {
    vi.stubEnv('WORKSPACE_DOMAINS_EDGE_SECRET', '');
    expect((await call('site')).status).toBe(503);
    vi.stubEnv('WORKSPACE_DOMAINS_EDGE_SECRET', SECRET);
    expect((await call('site', 'wrong')).status).toBe(401);
    expect((await call('resolve', null)).status).toBe(401);
    expect(mocks.resolveDomain).not.toHaveBeenCalled();
  });

  it('returns 404 for hosts that are not active and entitled', async () => {
    mocks.resolveDomain.mockResolvedValue(null);
    expect((await call('site')).status).toBe(404);
    expect((await call('resolve')).status).toBe(404);
    expect(mocks.payload).not.toHaveBeenCalled();
  });

  it('serves published content only for an entitled domain', async () => {
    mocks.resolveDomain.mockResolvedValue({
      wsId: 'ws-1',
      name: 'Phuc',
      avatarUrl: null,
      siteAvailable: true,
    });
    const response = await call('site');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      workspace: { wsId: 'ws-1' },
      revision: 'r1',
    });
    expect(mocks.payload).toHaveBeenCalledWith(
      expect.objectContaining({ includeDrafts: false, workspaceId: 'ws-1' }),
      expect.anything()
    );
  });
});

// @vitest-environment node
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  resolveWorkspaceId: (wsId: string) => wsId,
}));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess:
    mocks.requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding:
    mocks.resolveWorkspaceExternalProjectBinding,
}));
vi.mock('@/lib/external-projects/store', () => ({
  deleteWorkspaceExternalProjectAsset: vi.fn(),
  updateWorkspaceExternalProjectAsset: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {},
  createWorkspaceStorageSignedReadUrl:
    mocks.createWorkspaceStorageSignedReadUrl,
  resolveWorkspaceStorageProvider: vi.fn(async () => ({ provider: 'r2' })),
}));

import { GET } from './route';

function mockAsset(sourceUrl: string, status = 'published') {
  const single = vi.fn(async () => ({
    data: {
      id: 'asset-1',
      metadata: {},
      source_url: sourceUrl,
      storage_path: 'external-projects/custom/a/b/file.png',
      workspace_external_project_entries: { status },
      ws_id: 'ws-1',
    },
    error: null,
  }));
  mocks.createAdminClient.mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
    }),
  });
}

function getAsset() {
  return GET(
    new Request(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/asset-1'
    ),
    { params: Promise.resolve({ assetId: 'asset-1', wsId: 'ws-1' }) }
  );
}

describe('external project asset source redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'false');
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: { id: 'canonical-1' },
      enabled: true,
    });
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({ ok: true });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('redirects to a source on the platform storage origin', async () => {
    const source =
      'https://storage.example.test/storage/v1/object/public/cms/a.png';
    mockAsset(source);

    const response = await getAsset();

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(source);
  });

  it.each([
    ['a foreign https host', 'https://evil.example/a.png'],
    ['plain http', 'http://storage.example.test/storage/v1/object/public/a'],
    ['javascript:', 'javascript:alert(document.domain)'],
    ['data:', 'data:text/html;base64,PHNjcmlwdD4='],
    ['a protocol-relative URL', '//evil.example/a.png'],
    [
      'userinfo before a foreign host',
      'https://storage.example.test@evil.example/',
    ],
    ['a backslash host', 'https:\\\\evil.example/a.png'],
  ])('refuses %s without redirecting', async (_label, source) => {
    mockAsset(source);

    const response = await getAsset();

    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
    // A refused source is not swapped for the stored object either.
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('applies the same allowlist to authorized reads of unpublished assets', async () => {
    mockAsset('https://evil.example/a.png', 'draft');

    const response = await getAsset();

    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });
});

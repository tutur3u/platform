import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS = '82cf845a-49b0-459d-a5ee-1005e8de4fae';
const OTHER_WS = '11111111-2222-4333-8444-555555555555';
const PRODUCT = '0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4';
const IMAGE = 'inventory/media/product-featured-image/upload-id-beans.webp';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  maybeSingle: vi.fn(),
  workspace: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/permissions', () => ({
  canCreateInventorySales: (permissions: {
    containsPermission: (permission: string) => boolean;
  }) => permissions.containsPermission('create_inventory_sales'),
  canViewInventoryCatalog: (permissions: {
    containsPermission: (permission: string) => boolean;
  }) => permissions.containsPermission('view_inventory_catalog'),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageSignedReadUrl>
  ) => mocks.createWorkspaceStorageSignedReadUrl(...args),
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      const query = {
        eq: (...args: unknown[]) => {
          if (table === 'workspace_products') mocks.eq(...args);
          return query;
        },
        maybeSingle: () =>
          table === 'workspaces' ? mocks.workspace() : mocks.maybeSingle(),
        select: () => query,
      };
      return query;
    },
  }),
}));

function grant(...granted: string[]) {
  return {
    containsPermission: (permission: string) => granted.includes(permission),
  };
}

async function get(productId = PRODUCT, query = '') {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `https://inventory.tuturuuu.com/api/v1/workspaces/${WS}/products/${productId}/image${query}`
    ),
    { params: Promise.resolve({ productId, wsId: WS }) }
  );
}

function stored(avatarUrl: string | null) {
  mocks.maybeSingle.mockResolvedValue({
    data: avatarUrl === undefined ? null : { avatar_url: avatarUrl },
    error: null,
  });
}

const shareUrl = (ws: string, path: string) =>
  `https://tuturuuu.com/api/v1/workspaces/${ws}/storage/share?${new URLSearchParams({ path })}`;

describe('inventory product image route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: grant('view_inventory_catalog'),
        userId: 'user-1',
        wsId: WS,
      },
    });
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example.com/signed'
    );
    stored(shareUrl(WS, IMAGE));
    mocks.workspace.mockResolvedValue({
      data: { personal: false },
      error: null,
    });
  });

  it('accepts Inventory sessions only', async () => {
    await get();
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      WS,
      { appSessionTargets: ['inventory'] }
    );
  });

  it('reads a stored personal slug only for a personal workspace', async () => {
    stored(shareUrl('personal', IMAGE));
    expect((await get()).status).toBe(404);
    mocks.workspace.mockResolvedValue({
      data: { personal: true },
      error: null,
    });
    expect((await get()).status).toBe(302);
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      WS,
      IMAGE,
      { expiresIn: 3600 }
    );
  });

  it('reads a stored internal slug only for the root workspace', async () => {
    stored(shareUrl('internal', IMAGE));
    expect((await get()).status).toBe(404);
    const root = '00000000-0000-0000-0000-000000000000';
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: grant('view_inventory_catalog'),
        userId: 'user-1',
        wsId: root,
      },
    });
    expect((await get()).status).toBe(302);
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      root,
      IMAGE,
      { expiresIn: 3600 }
    );
  });

  it('redirects catalog readers to a fresh signed read', async () => {
    const response = await get();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://storage.example.com/signed'
    );
    // Reused well inside the signed URL's hour, never by shared caches.
    expect(response.headers.get('cache-control')).toBe('private, max-age=300');
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      WS,
      IMAGE,
      { expiresIn: 3600 }
    );
    // The product is looked up inside the authorized workspace.
    expect(mocks.eq).toHaveBeenCalledWith('id', PRODUCT);
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', WS);
  });

  it('returns JSON for native clients', async () => {
    const response = await get(PRODUCT, '?format=json');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.signedUrl).toBe('https://storage.example.com/signed');
    expect(typeof body.expiresAt).toBe('string');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('lets create-sales readers in without drive access', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: grant('create_inventory_sales'),
        userId: 'user-2',
        wsId: WS,
      },
    });
    expect((await get()).status).toBe(302);
  });

  it('refuses actors without inventory read access', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: { permissions: grant('view_drive'), userId: 'user-3', wsId: WS },
    });
    expect((await get()).status).toBe(403);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('passes through workspace authorization failures', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    expect((await get()).status).toBe(401);
  });

  it('reads legacy signed URLs for the same workspace', async () => {
    stored(
      `https://project.supabase.co/storage/v1/object/sign/workspaces/${WS}/${IMAGE}?token=t`
    );
    expect((await get()).status).toBe(302);
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      WS,
      IMAGE,
      { expiresIn: 3600 }
    );
  });

  it.each([
    ['another workspace', shareUrl(OTHER_WS, IMAGE)],
    [
      'another workspace in a signed URL',
      `https://project.supabase.co/storage/v1/object/sign/workspaces/${OTHER_WS}/${IMAGE}?token=t`,
    ],
    [
      'another media target',
      shareUrl(WS, 'inventory/media/storefront-banner/a.png'),
    ],
    ['a non-inventory path', shareUrl(WS, 'drive/private/contract.pdf')],
    [
      'a traversal path',
      shareUrl(WS, 'inventory/media/product-featured-image/../../drive/a.pdf'),
    ],
    [
      'an encoded traversal',
      `https://project.supabase.co/storage/v1/object/sign/workspaces/${WS}/inventory/media/product-featured-image/%2e%2e/secret.png?token=t`,
    ],
    ['a public CDN image', 'https://cdn.tuturuuu.com/public/a.png'],
    ['no image', null],
  ])('does not sign %s', async (_, avatarUrl) => {
    stored(avatarUrl);
    expect((await get()).status).toBe(404);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('answers 404 for a product outside the workspace', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await get()).status).toBe(404);
  });

  it('rejects malformed product ids before any lookup', async () => {
    expect((await get('not-a-uuid')).status).toBe(404);
    expect(mocks.authorizeInventoryWorkspace).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getCmsWorkspaceAccess: vi.fn(),
  hasFinanceOverviewPermission: vi.fn(),
  hasInsightsPermission: vi.fn(),
  hasProductReadPermission: vi.fn(),
  hasStorefrontPublishPermission: vi.fn(),
  hasStorefrontReadPermission: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/external-projects/access', () => ({
  getCmsWorkspaceAccess: mocks.getCmsWorkspaceAccess,
  hasCmsCommerceFinanceOverviewPermission: mocks.hasFinanceOverviewPermission,
  hasCmsCommerceInsightsPermission: mocks.hasInsightsPermission,
  hasCmsCommerceProductReadPermission: mocks.hasProductReadPermission,
  hasCmsCommerceStorefrontPublishPermission:
    mocks.hasStorefrontPublishPermission,
  hasCmsCommerceStorefrontReadPermission: mocks.hasStorefrontReadPermission,
}));

function allowExternalProjectWorkspaceAccess() {
  mocks.getCmsWorkspaceAccess.mockResolvedValue({
    canAccessWorkspace: true,
    normalizedWorkspaceId: 'ws-1',
    workspacePermissions: { containsPermission: vi.fn() },
  });
}

describe('CMS commerce RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowExternalProjectWorkspaceAccess();
  });

  it('rejects overview access without finance stats permission', async () => {
    mocks.hasFinanceOverviewPermission.mockReturnValue(false);

    const { GET } = await import('./overview/route');
    const response = await GET(
      new Request('http://localhost/api/v1/commerce/overview?wsId=ws-1')
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects products access without inventory catalog and stock permission', async () => {
    mocks.hasProductReadPermission.mockReturnValue(false);

    const { GET } = await import('./products/route');
    const response = await GET(
      new Request('http://localhost/api/v1/commerce/products?wsId=ws-1')
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects storefront reads without inventory catalog permission', async () => {
    mocks.hasStorefrontReadPermission.mockReturnValue(false);

    const { GET } = await import('./storefront/route');
    const response = await GET(
      new Request('http://localhost/api/v1/commerce/storefront?wsId=ws-1')
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects storefront publishes without inventory catalog management', async () => {
    mocks.hasStorefrontPublishPermission.mockReturnValue(false);

    const { POST } = await import('./storefront/route');
    const response = await POST(
      new Request('http://localhost/api/v1/commerce/storefront', {
        body: JSON.stringify({ productId: 'product-1', wsId: 'ws-1' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects insights access without inventory analytics or product read permission', async () => {
    mocks.hasInsightsPermission.mockReturnValue(false);

    const { GET } = await import('./insights/route');
    const response = await GET(
      new Request('http://localhost/api/v1/commerce/insights?wsId=ws-1')
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

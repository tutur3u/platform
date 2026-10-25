import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient, mockCreateClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: mockCreateClient,
}));

import { getWorkspaceTier } from '../workspace-helper';

const workspaceId = '11111111-1111-4111-8111-111111111111';

function adminClient(
  subscriptions: unknown[],
  products: Array<{ id: string; tier: string }>
) {
  const subscriptionQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: subscriptions, error: null }),
  };
  const productQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: products, error: null }),
  };
  const from = vi.fn((table: string) => {
    if (table === 'workspace_subscriptions') return subscriptionQuery;
    throw new Error(`unexpected public table ${table}`);
  });
  return {
    client: {
      from,
      schema: vi.fn(() => ({ from: vi.fn(() => productQuery) })),
    },
    from,
    subscriptionQuery,
  };
}

describe('getWorkspaceTier admin lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves the tier from subscriptions without a workspace existence round trip', async () => {
    const admin = adminClient(
      [
        {
          ws_id: workspaceId,
          created_at: '2026-10-01T00:00:00.000Z',
          product_id: 'product-pro',
          status: 'active',
        },
      ],
      [{ id: 'product-pro', tier: 'PRO' }]
    );
    mockCreateAdminClient.mockResolvedValue(admin.client);

    await expect(
      getWorkspaceTier(workspaceId, { useAdmin: true })
    ).resolves.toBe('PRO');
    expect(admin.from).not.toHaveBeenCalledWith('workspaces');
    expect(admin.subscriptionQuery.in).toHaveBeenCalledWith('ws_id', [
      workspaceId,
    ]);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('returns FREE for an unknown workspace without subscriptions', async () => {
    const admin = adminClient([], []);
    mockCreateAdminClient.mockResolvedValue(admin.client);

    await expect(
      getWorkspaceTier(workspaceId, { useAdmin: true })
    ).resolves.toBe('FREE');
  });

  it('returns FREE for non-UUID identifiers without querying', async () => {
    await expect(
      getWorkspaceTier('workspace-slug', { useAdmin: true })
    ).resolves.toBe('FREE');
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('keeps the RLS visibility read for request-scoped lookups', async () => {
    const workspaceQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const from = vi.fn(() => workspaceQuery);
    mockCreateClient.mockResolvedValue({ from });

    await expect(getWorkspaceTier(workspaceId)).resolves.toBe('FREE');
    expect(from).toHaveBeenCalledWith('workspaces');
    expect(workspaceQuery.eq).toHaveBeenCalledWith('id', workspaceId);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });
});

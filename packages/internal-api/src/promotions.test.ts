import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspacePromotion,
  listWorkspacePromotions,
  listWorkspaceUserLinkedPromotions,
  listWorkspaceUserReferralDiscounts,
  updateWorkspacePromotion,
} from './promotions';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('promotions internal API helpers', () => {
  it('lists workspace promotions through the centralized helper', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([]));

    await listWorkspacePromotions('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates and updates promotions with encoded workspace and promotion ids', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };
    const payload = {
      code: 'SUMMER',
      description: 'Summer tuition discount',
      max_uses: 25,
      name: 'Summer',
      unit: 'percentage' as const,
      value: 10,
    };

    await createWorkspacePromotion('workspace 1', payload, options);
    await updateWorkspacePromotion('workspace 1', 'promo/1', payload, options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions',
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions/promo%2F1',
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'PUT',
      })
    );
  });

  it('lists user-linked promotions and referral discounts through workspace user routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValueOnce(createJsonResponse([]));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listWorkspaceUserLinkedPromotions('workspace 1', 'user/1', options);
    await listWorkspaceUserReferralDiscounts('workspace 1', 'user/1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/users/user%2F1/linked-promotions',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/users/user%2F1/referral-discounts',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });
});

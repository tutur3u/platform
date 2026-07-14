import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));

vi.mock('@tuturuuu/internal-api/client', () => ({
  encodePathSegment: encodeURIComponent,
  getInternalApiClient: () => ({ json: mocks.json }),
}));

import {
  linkWorkspaceUserPromotion,
  unlinkWorkspaceUserPromotion,
} from './promotion-api-client';

describe('Contacts user promotion API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.json.mockResolvedValue({ message: 'success' });
  });

  it('encodes link and unlink requests to the Contacts-owned route', async () => {
    const route =
      '/api/v1/workspaces/workspace%201/users/user%2F1/linked-promotions';

    await linkWorkspaceUserPromotion('workspace 1', 'user/1', 'promo/1');
    await unlinkWorkspaceUserPromotion('workspace 1', 'user/1', 'promo/1');

    expect(mocks.json).toHaveBeenNthCalledWith(
      1,
      route,
      expect.objectContaining({
        body: JSON.stringify({ promoId: 'promo/1' }),
        method: 'POST',
      })
    );
    expect(mocks.json).toHaveBeenNthCalledWith(
      2,
      route,
      expect.objectContaining({
        method: 'DELETE',
        query: { promoId: 'promo/1' },
      })
    );
  });
});

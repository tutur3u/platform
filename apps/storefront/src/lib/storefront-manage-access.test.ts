import { describe, expect, it, vi } from 'vitest';
import {
  createInventoryStorefrontManageHref,
  resolveInventoryStorefrontManageHref,
} from './storefront-manage-access';

const storefront = {
  id: 'storefront-123',
  wsId: 'bf2c1c8d-e20b-46d6-a68d-f7fc13768ecf',
};

describe('storefront management access', () => {
  it('builds an Inventory deep link for the exact storefront', () => {
    expect(
      createInventoryStorefrontManageHref(
        storefront,
        'https://inventory.tuturuuu.com'
      )
    ).toBe(
      'https://inventory.tuturuuu.com/bf2c1c8d-e20b-46d6-a68d-f7fc13768ecf/storefront?storefront=storefront-123'
    );
  });

  it('returns the deep link only for a joined workspace member', async () => {
    const workspaceLookup = vi.fn().mockResolvedValue({ joined: true });

    await expect(
      resolveInventoryStorefrontManageHref({
        storefront,
        user: { email: 'owner@example.com', id: 'user-1' },
        workspaceLookup,
      })
    ).resolves.toContain('/storefront?storefront=storefront-123');

    expect(workspaceLookup).toHaveBeenCalledWith(storefront.wsId, {
      useAdmin: true,
      user: { email: 'owner@example.com', id: 'user-1' },
    });
  });

  it.each([[{ joined: false }], [null]])(
    'hides management for inaccessible workspaces',
    async (workspace) => {
      await expect(
        resolveInventoryStorefrontManageHref({
          storefront,
          user: { id: 'user-1' },
          workspaceLookup: vi.fn().mockResolvedValue(workspace),
        })
      ).resolves.toBeNull();
    }
  );

  it('fails closed without disrupting public browsing', async () => {
    await expect(
      resolveInventoryStorefrontManageHref({
        storefront,
        user: { id: 'user-1' },
        workspaceLookup: vi.fn().mockRejectedValue(new Error('unavailable')),
      })
    ).resolves.toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { buildPolarProductSyncSummary } from './polar-product-sync-reconcile';

vi.mock('server-only', () => ({}));

describe('buildPolarProductSyncSummary', () => {
  it('keeps synchronized listing and bundle identities visible', () => {
    const summary = buildPolarProductSyncSummary(
      [
        {
          name: 'Acrylic Keychain · Vaiolis',
          polar_last_error: null,
          polar_product_id: 'polar-listing-1',
          polar_sync_status: 'synced',
          polar_synced_at: '2026-07-13T13:39:46.243Z',
        },
        {
          name: 'Acrylic Keychain · Demo store',
          polar_last_error: null,
          polar_product_id: null,
          polar_sync_status: null,
          polar_synced_at: null,
        },
      ],
      [
        {
          name: 'Convention pack',
          polar_last_error: 'Polar rejected the price',
          polar_product_id: 'polar-bundle-1',
          polar_sync_status: 'error',
          polar_synced_at: null,
        },
      ]
    );

    expect(summary.listings).toEqual({
      disabled: 0,
      error: 0,
      pending: 1,
      synced: 1,
      total: 2,
    });
    expect(summary.bundles.error).toBe(1);
    expect(summary.items).toEqual([
      expect.objectContaining({
        kind: 'listing',
        name: 'Acrylic Keychain · Vaiolis',
        polarProductId: 'polar-listing-1',
        status: 'synced',
      }),
      expect.objectContaining({
        kind: 'listing',
        name: 'Acrylic Keychain · Demo store',
        status: 'pending',
      }),
      expect.objectContaining({
        kind: 'bundle',
        name: 'Convention pack',
        status: 'error',
      }),
    ]);
    expect(summary.errors).toEqual([
      expect.objectContaining({
        kind: 'bundle',
        name: 'Convention pack',
      }),
    ]);
  });
});

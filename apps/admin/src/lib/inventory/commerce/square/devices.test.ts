import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInventorySquareDeviceCodePaired } from './devices';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getPrivateAdmin: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('./settings-store', () => ({
  getPrivateAdmin: () => mocks.getPrivateAdmin(),
}));

vi.mock('./connection-store', () => ({
  getInventorySquareAccessContext: vi.fn(),
}));

vi.mock('./client', () => ({
  createSquareDeviceCodeApi: vi.fn(),
  createSquareIdempotencyKey: vi.fn(),
  listSquareDevicesApi: vi.fn(),
  listSquareLocationsApi: vi.fn(),
  SquareApiError: class SquareApiError extends Error {},
}));

describe('Square device reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.getPrivateAdmin.mockResolvedValue({
      from: vi.fn(() => ({ upsert: mocks.upsert })),
    });
  });

  it('upserts paired device-code webhooks into the private device cache', async () => {
    await expect(
      syncInventorySquareDeviceCodePaired({
        deviceCode: {
          code: 'PAIRME',
          device_id: 'device-1',
          id: 'device-code-1',
          location_id: 'location-1',
          name: 'Front counter',
          product_type: 'TERMINAL_API',
          status: 'PAIRED',
        },
        environment: 'production',
        wsId: 'workspace-1',
      })
    ).resolves.toBe(true);

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_code_id: 'device-code-1',
        device_id: 'device-1',
        device_name: 'Front counter',
        environment: 'production',
        location_id: 'location-1',
        pairing_code: 'PAIRME',
        product_type: 'TERMINAL_API',
        status: 'PAIRED',
        ws_id: 'workspace-1',
      }),
      { onConflict: 'device_code_id' }
    );
  });

  it('ignores pairing webhooks without both code id and paired device id', async () => {
    await expect(
      syncInventorySquareDeviceCodePaired({
        deviceCode: { id: 'device-code-1' },
        environment: 'sandbox',
        wsId: 'workspace-1',
      })
    ).resolves.toBe(false);

    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInventorySquareDeviceCode,
  syncInventorySquareDeviceCodePaired,
} from './devices';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createSquareDeviceCodeApi: vi.fn(),
  createSquareIdempotencyKey: vi.fn(),
  eq: vi.fn(),
  getPrivateAdmin: vi.fn(),
  getInventorySquareAccessContext: vi.fn(),
  insert: vi.fn(),
  loadSettingsRow: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('./settings-store', () => ({
  getPrivateAdmin: () => mocks.getPrivateAdmin(),
  loadSettingsRow: (...args: unknown[]) => mocks.loadSettingsRow(...args),
}));

vi.mock('./connection-store', () => ({
  getInventorySquareAccessContext: (...args: unknown[]) =>
    mocks.getInventorySquareAccessContext(...args),
}));

vi.mock('./client', () => ({
  createSquareDeviceCodeApi: (...args: unknown[]) =>
    mocks.createSquareDeviceCodeApi(...args),
  createSquareIdempotencyKey: (...args: unknown[]) =>
    mocks.createSquareIdempotencyKey(...args),
  listSquareDevicesApi: vi.fn(),
  listSquareLocationsApi: vi.fn(),
  SquareApiError: class SquareApiError extends Error {},
}));

describe('Square device reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSquareIdempotencyKey.mockReturnValue('device-idempotency-key');
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.getPrivateAdmin.mockResolvedValue({
      from: vi.fn(() => ({
        insert: mocks.insert,
        update: mocks.update,
        upsert: mocks.upsert,
      })),
    });
  });

  it('persists a newly created pairing code without an invalid partial-index upsert', async () => {
    mocks.getInventorySquareAccessContext.mockResolvedValue({
      accessToken: 'square-token',
      environment: 'production',
    });
    mocks.loadSettingsRow.mockResolvedValue({ location_id: 'saved-location' });
    mocks.createSquareDeviceCodeApi.mockResolvedValue({
      code: 'PAIRME',
      id: 'device-code-1',
      location_id: 'location-1',
      name: 'Merch booth',
      pair_by: '2026-07-19T13:00:00.000Z',
      product_type: 'TERMINAL_API',
      status: 'UNPAIRED',
    });

    await expect(
      createInventorySquareDeviceCode({
        locationId: 'location-1',
        name: 'Merch booth',
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        code: 'PAIRME',
        id: 'device-code-1',
        locationId: 'location-1',
      })
    );

    expect(mocks.createSquareDeviceCodeApi).toHaveBeenCalledWith({
      accessToken: 'square-token',
      environment: 'production',
      idempotencyKey: 'device-idempotency-key',
      locationId: 'location-1',
      name: 'Merch booth',
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_code_id: 'device-code-1',
        environment: 'production',
        pairing_code: 'PAIRME',
        ws_id: 'workspace-1',
      })
    );
    expect(mocks.upsert).not.toHaveBeenCalledWith(expect.anything(), {
      onConflict: 'device_code_id',
    });
  });

  it('reconciles a duplicate-code insert race by updating the cached pending row', async () => {
    mocks.getInventorySquareAccessContext.mockResolvedValue({
      accessToken: 'square-token',
      environment: 'production',
    });
    mocks.loadSettingsRow.mockResolvedValue({ location_id: 'location-1' });
    mocks.createSquareDeviceCodeApi.mockResolvedValue({
      code: 'PAIRME',
      id: 'device-code-1',
      location_id: 'location-1',
      status: 'UNPAIRED',
    });
    mocks.insert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate device code' },
    });
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: 'cached-device-row' },
        error: null,
      });

    await expect(
      createInventorySquareDeviceCode({
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual(expect.objectContaining({ id: 'device-code-1' }));

    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('surfaces non-conflict cache failures instead of hiding persistence errors', async () => {
    mocks.getInventorySquareAccessContext.mockResolvedValue({
      accessToken: 'square-token',
      environment: 'production',
    });
    mocks.loadSettingsRow.mockResolvedValue({ location_id: 'location-1' });
    mocks.createSquareDeviceCodeApi.mockResolvedValue({
      code: 'PAIRME',
      id: 'device-code-1',
      location_id: 'location-1',
      status: 'UNPAIRED',
    });
    mocks.insert.mockResolvedValueOnce({
      error: { code: '42501', message: 'cache write denied' },
    });

    await expect(
      createInventorySquareDeviceCode({
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('cache write denied');
  });

  it('upserts paired device-code webhooks into the private device cache', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { id: 'cached-device-row' },
      error: null,
    });

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

    expect(mocks.update).toHaveBeenCalledWith(
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
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('device_code_id', 'device-code-1');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('falls back to the real device identity constraint when a webhook has no pending cache row', async () => {
    await expect(
      syncInventorySquareDeviceCodePaired({
        deviceCode: {
          device_id: 'device-1',
          id: 'device-code-1',
          location_id: 'location-1',
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
        environment: 'production',
        ws_id: 'workspace-1',
      }),
      { onConflict: 'ws_id,environment,device_id' }
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

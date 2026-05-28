import { describe, expect, it, vi } from 'vitest';
import { resolveProductManufacturerId } from './manufacturers';

describe('resolveProductManufacturerId', () => {
  it('clears the manufacturer when the normalized id is nullish', async () => {
    const sbAdmin = {
      from: vi.fn(),
    };

    await expect(
      resolveProductManufacturerId({
        sbAdmin: sbAdmin as never,
        wsId: 'workspace-id',
        manufacturerId: null,
      })
    ).resolves.toEqual({ ok: true, manufacturerId: null });

    expect(sbAdmin.from).not.toHaveBeenCalled();
  });

  it('validates a manufacturer id belongs to the workspace', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 'manufacturer-id' }, error: null });
    const eqWsId = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqWsId });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });

    await expect(
      resolveProductManufacturerId({
        sbAdmin: { from } as never,
        wsId: 'workspace-id',
        manufacturerId: 'manufacturer-id',
      })
    ).resolves.toEqual({ ok: true, manufacturerId: 'manufacturer-id' });

    expect(from).toHaveBeenCalledWith('inventory_manufacturers');
    expect(eqId).toHaveBeenCalledWith('id', 'manufacturer-id');
    expect(eqWsId).toHaveBeenCalledWith('ws_id', 'workspace-id');
  });

  it('upserts legacy manufacturer text and returns the normalized id', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: 'manufacturer-id' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });

    await expect(
      resolveProductManufacturerId({
        sbAdmin: { from } as never,
        wsId: 'workspace-id',
        legacyManufacturerName: '  Acme  ',
      })
    ).resolves.toEqual({ ok: true, manufacturerId: 'manufacturer-id' });

    expect(upsert).toHaveBeenCalledWith(
      {
        ws_id: 'workspace-id',
        name: 'Acme',
      },
      { onConflict: 'ws_id,name' }
    );
  });
});

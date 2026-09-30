import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { updateScheduledPeriod } from './period-pricing';
import { editPricedProduct } from './priced-product-edit';

vi.mock('server-only', () => ({}));
function client(result: object, probeError: object | null = null) {
  const rpc = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockResolvedValue({ error: probeError });
  const select = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ select });
  return {
    rpc,
    from,
    sb: { schema: () => ({ rpc, from }) } as unknown as TypedSupabaseClient,
  };
}
describe('authoritative edit routing during pricing transitions', () => {
  it('routes an unpriced product directly through its atomic edit, without a preliminary price read', async () => {
    const c = client({
      data: { deleted: 0, inserted: 0, updated: 1 },
      error: null,
    });
    await editPricedProduct({
      sbAdmin: c.sb,
      wsId: 'ws',
      productId: 'product',
      inventory: [],
    });
    expect(c.rpc).toHaveBeenCalledWith(
      'edit_inventory_priced_product',
      expect.objectContaining({ p_product_id: 'product' })
    );
    expect(c.from).not.toHaveBeenCalled();
  });
  it('routes a legacy-period edit through the locked transaction without reading a potentially stale mode', async () => {
    const c = client({ data: true, error: null });
    expect(
      await updateScheduledPeriod(c.sb, 'ws', 'period', {}, ['product'])
    ).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith(
      'update_inventory_scheduled_period',
      expect.objectContaining({ p_product_ids: ['product'] })
    );
    expect(c.from).not.toHaveBeenCalled();
  });
  it('fails closed if pricing exists but atomic edit RPCs are unavailable', async () => {
    const error = { code: 'PGRST202' };
    const c = client({ data: null, error });
    await expect(
      editPricedProduct({ sbAdmin: c.sb, wsId: 'ws', productId: 'product' })
    ).rejects.toEqual(error);
    await expect(
      updateScheduledPeriod(c.sb, 'ws', 'period', {})
    ).rejects.toEqual(error);
  });
  it('permits old-schema legacy fallback only when price support is absent', async () => {
    const c = client({ error: { code: 'PGRST202' } }, { code: 'PGRST205' });
    expect(
      await editPricedProduct({
        sbAdmin: c.sb,
        wsId: 'ws',
        productId: 'product',
      })
    ).toBeNull();
    const p = client({ error: { code: 'PGRST202' } }, { code: 'PGRST204' });
    expect(await updateScheduledPeriod(p.sb, 'ws', 'period', {})).toBe(false);
    await expect(
      updateScheduledPeriod(p.sb, 'ws', 'period', { pricing_mode: 'scheduled' })
    ).rejects.toEqual({ code: 'PGRST202' });
  });
});

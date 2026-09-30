import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  config: vi.fn(),
  mode: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/period-pricing', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/inventory-core/period-pricing')
  >()),
  periodPricingRpc: mocks.rpc,
  getPeriodPricingMode: mocks.mode,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: mocks.config,
}));

import {
  type CreateInvoiceRequest,
  createPeriodInvoice,
} from './period-invoice';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const payload: CreateInvoiceRequest = {
  inventory_period_id: id(1),
  inventory_request_id: id(2),
  price_mode: 'custom',
  content: 'Synthetic sale',
  wallet_id: id(3),
  category_id: id(4),
  products: [
    {
      product_id: id(5),
      unit_id: id(6),
      warehouse_id: id(7),
      price_id: id(8),
      price: 60000,
      quantity: 1,
      category_id: id(4),
    },
  ],
};
const create = (value = payload) =>
  createPeriodInvoice({
    sbAdmin: {} as never,
    wsId: id(9),
    actorId: id(10),
    workspaceUserId: id(11),
    payload: value,
  });
describe('period invoice boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockResolvedValue('VND');
    mocks.mode.mockResolvedValue('scheduled');
    mocks.rpc.mockResolvedValue(id(12));
  });
  it('preserves legacy sub-cent precision and missing currency fallback', async () => {
    mocks.mode.mockResolvedValue('legacy');
    mocks.config.mockResolvedValue('USD');
    const legacy = {
      ...payload,
      products: [
        { ...payload.products[0]!, price: 0.001, price_id: undefined },
      ],
    };
    expect((await create(legacy)).status).toBe(200);
    mocks.config.mockResolvedValue(null);
    expect((await create(legacy)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      {},
      'create_inventory_period_invoice',
      expect.objectContaining({ p_currency: 'USD' })
    );
  });
  it('delegates all write operations to the atomic RPC with quote references', async () => {
    const response = await create();
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      {},
      'create_inventory_period_invoice',
      expect.objectContaining({
        p_currency: 'VND',
        p_request_id: id(2),
        p_period_id: id(1),
        p_products: [
          expect.objectContaining({ price_id: id(8), price: 60000 }),
        ],
      })
    );
  });
  it('returns stale eligibility/price conflicts without another write path', async () => {
    mocks.rpc.mockRejectedValue({ code: '23514' });
    expect((await create()).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('fails closed before migration rollout', async () => {
    mocks.rpc.mockRejectedValue({ code: 'PGRST202' });
    expect((await create()).status).toBe(503);
  });
  it('rejects price precision, fractional stock quantities, promotions and catalog bypass', async () => {
    expect(
      (
        await create({
          ...payload,
          products: [{ ...payload.products[0]!, price: 8.1 }],
        })
      ).status
    ).toBe(400);
    expect(
      (
        await create({
          ...payload,
          products: [{ ...payload.products[0]!, quantity: 1.5 }],
        })
      ).status
    ).toBe(400);
    expect((await create({ ...payload, promotion_id: id(15) })).status).toBe(
      400
    );
    expect((await create({ ...payload, price_mode: 'catalog' })).status).toBe(
      400
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

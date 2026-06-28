import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  syncInventorySquarePayment,
  syncInventorySquareTerminalCheckout,
} from './terminal';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPrivateAdmin: vi.fn(),
  maybeSingle: vi.fn(),
  recordInventorySaleFinanceTransaction: vi.fn(),
  releaseCheckout: vi.fn(),
  rpc: vi.fn(),
  selectEq: vi.fn(),
  updateFirstEq: vi.fn(),
  updateSecondEq: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/inventory/commerce/checkouts', () => ({
  getCheckoutById: vi.fn(),
  releaseCheckout: (...args: Parameters<typeof mocks.releaseCheckout>) =>
    mocks.releaseCheckout(...args),
}));

vi.mock('@/lib/inventory/commerce/finance', () => ({
  recordInventorySaleFinanceTransaction: (
    ...args: Parameters<typeof mocks.recordInventorySaleFinanceTransaction>
  ) => mocks.recordInventorySaleFinanceTransaction(...args),
}));

vi.mock('./settings-store', () => ({
  getPrivateAdmin: () => mocks.getPrivateAdmin(),
}));

function privateAdminMock() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mocks.selectEq,
      })),
      update: vi.fn(() => ({
        eq: mocks.updateFirstEq,
      })),
    })),
  };
}

describe('Square terminal checkout sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      schema: () => ({ rpc: mocks.rpc }),
    });
    mocks.getPrivateAdmin.mockResolvedValue(privateAdminMock());
    mocks.selectEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.updateFirstEq.mockReturnValue({ eq: mocks.updateSecondEq });
    mocks.updateSecondEq.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.recordInventorySaleFinanceTransaction.mockResolvedValue(undefined);
    mocks.releaseCheckout.mockResolvedValue({ id: 'checkout-1' });
  });

  it('releases reservations when terminal checkout is canceled', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'checkout-1', ws_id: 'ws-1' },
      error: null,
    });

    await expect(
      syncInventorySquareTerminalCheckout({
        device_options: { device_id: 'device-1' },
        id: 'terminal-checkout-1',
        order_id: 'order-1',
        status: 'CANCELED',
      } as never)
    ).resolves.toBe(true);

    expect(mocks.selectEq).toHaveBeenCalledWith(
      'square_terminal_checkout_id',
      'terminal-checkout-1'
    );
    expect(mocks.updateFirstEq).toHaveBeenCalledWith('id', 'checkout-1');
    expect(mocks.updateSecondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.releaseCheckout).toHaveBeenCalledWith('ws-1', 'checkout-1');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('completes paid terminal checkouts idempotently through the private RPC', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'checkout-1', ws_id: 'ws-1' },
      error: null,
    });

    await expect(
      syncInventorySquareTerminalCheckout({
        device_options: { device_id: 'device-1' },
        id: 'terminal-checkout-1',
        order_id: 'order-1',
        payment_ids: ['payment-1'],
        status: 'COMPLETED',
      } as never)
    ).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_inventory_checkout_session_square_payment',
      {
        p_checkout_id: 'checkout-1',
        p_square_order_id: 'order-1',
        p_square_payment_id: 'payment-1',
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.recordInventorySaleFinanceTransaction).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
    });
  });

  it('maps completed Square payments to paid checkout completion', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'checkout-1', ws_id: 'ws-1' },
      error: null,
    });

    await expect(
      syncInventorySquarePayment({
        id: 'payment-1',
        order_id: 'order-1',
        receipt_url: 'https://squareup.com/receipt',
        status: 'COMPLETED',
      } as never)
    ).resolves.toBe(true);

    expect(mocks.selectEq).toHaveBeenCalledWith('square_order_id', 'order-1');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_inventory_checkout_session_square_payment',
      expect.objectContaining({
        p_square_order_id: 'order-1',
        p_square_payment_id: 'payment-1',
      })
    );
  });
});

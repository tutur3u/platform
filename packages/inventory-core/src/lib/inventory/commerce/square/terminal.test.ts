import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInventorySquareTerminalCheckout,
  syncInventorySquarePayment,
  syncInventorySquareTerminalCheckout,
} from './terminal';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createSquareOrderApi: vi.fn(),
  createSquareTerminalCheckoutApi: vi.fn(),
  getCheckoutById: vi.fn(),
  getInventorySquareTerminalContext: vi.fn(),
  getPrivateAdmin: vi.fn(),
  maybeSingle: vi.fn(),
  privateUpdate: vi.fn(),
  recordInventorySaleFinanceTransaction: vi.fn(),
  releaseCheckout: vi.fn(),
  rpc: vi.fn(),
  selectEq: vi.fn(),
  selectSecondEq: vi.fn(),
  selectThirdEq: vi.fn(),
  updateFirstEq: vi.fn(),
  updateSecondEq: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('../checkouts', () => ({
  getCheckoutById: (...args: Parameters<typeof mocks.getCheckoutById>) =>
    mocks.getCheckoutById(...args),
  releaseCheckout: (...args: Parameters<typeof mocks.releaseCheckout>) =>
    mocks.releaseCheckout(...args),
}));

vi.mock('../finance', () => ({
  recordInventorySaleFinanceTransaction: (
    ...args: Parameters<typeof mocks.recordInventorySaleFinanceTransaction>
  ) => mocks.recordInventorySaleFinanceTransaction(...args),
}));

vi.mock('./settings-store', () => ({
  getPrivateAdmin: () => mocks.getPrivateAdmin(),
}));

vi.mock('./connection-store', () => ({
  getInventorySquareTerminalContext: (
    ...args: Parameters<typeof mocks.getInventorySquareTerminalContext>
  ) => mocks.getInventorySquareTerminalContext(...args),
}));

vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    createSquareOrderApi: (
      ...args: Parameters<typeof mocks.createSquareOrderApi>
    ) => mocks.createSquareOrderApi(...args),
    createSquareTerminalCheckoutApi: (
      ...args: Parameters<typeof mocks.createSquareTerminalCheckoutApi>
    ) => mocks.createSquareTerminalCheckoutApi(...args),
  };
});

function privateAdminMock() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mocks.selectEq,
      })),
      update: mocks.privateUpdate,
    })),
  };
}

const reservedCheckout = {
  currency: 'USD',
  id: '00000000-0000-4000-8000-000000000001',
  lines: [
    {
      id: 'line-1',
      productId: 'product-1',
      quantity: 2,
      title: 'Coffee beans',
      unitPrice: 1250,
    },
  ],
  note: '',
  publicToken: 'ORDER-1',
  status: 'reserved',
  totalAmount: 2500,
  wsId: 'ws-1',
};

describe('Square terminal checkout sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      schema: () => ({ rpc: mocks.rpc }),
    });
    mocks.createSquareOrderApi.mockResolvedValue({ id: 'order-1' });
    mocks.createSquareTerminalCheckoutApi.mockResolvedValue({
      id: 'terminal-checkout-1',
      status: 'PENDING',
    });
    mocks.getCheckoutById.mockResolvedValue(reservedCheckout);
    mocks.getInventorySquareTerminalContext.mockResolvedValue({
      accessToken: 'square-access-token',
      deviceId: 'device-default',
      environment: 'production',
      locationId: 'location-1',
      wsId: 'ws-1',
    });
    mocks.getPrivateAdmin.mockResolvedValue(privateAdminMock());
    mocks.selectEq.mockReturnValue({ eq: mocks.selectSecondEq });
    mocks.selectSecondEq.mockReturnValue({ eq: mocks.selectThirdEq });
    mocks.selectThirdEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.privateUpdate.mockReturnValue({ eq: mocks.updateFirstEq });
    mocks.updateFirstEq.mockReturnValue({ eq: mocks.updateSecondEq });
    mocks.updateSecondEq.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.recordInventorySaleFinanceTransaction.mockResolvedValue(undefined);
    mocks.releaseCheckout.mockResolvedValue({ id: 'checkout-1' });
  });

  it('creates order-linked terminal checkout payloads with itemized cart enabled', async () => {
    await expect(
      createInventorySquareTerminalCheckout({
        checkoutId: reservedCheckout.id,
        deviceId: 'device-selected',
        wsId: 'ws-1',
      })
    ).resolves.toMatchObject({
      squareCheckout: { id: 'terminal-checkout-1' },
    });

    expect(mocks.createSquareOrderApi).toHaveBeenCalledWith({
      accessToken: 'square-access-token',
      body: {
        idempotency_key: `order-${reservedCheckout.id}`,
        order: {
          line_items: [
            {
              base_price_money: { amount: 1250, currency: 'USD' },
              metadata: {
                checkout_line_id: 'line-1',
                product_id: 'product-1',
              },
              name: 'Coffee beans',
              quantity: '2',
            },
          ],
          location_id: 'location-1',
          metadata: {
            checkout_id: reservedCheckout.id,
            public_token: 'ORDER-1',
            ws_id: 'ws-1',
          },
          reference_id: 'ORDER-1',
        },
      },
      environment: 'production',
    });
    expect(mocks.createSquareTerminalCheckoutApi).toHaveBeenCalledWith({
      accessToken: 'square-access-token',
      body: {
        checkout: {
          amount_money: { amount: 2500, currency: 'USD' },
          device_options: {
            device_id: 'device-selected',
            show_itemized_cart: true,
          },
          note: 'Tuturuuu order ORDER-1',
          order_id: 'order-1',
          reference_id: 'ORDER-1',
        },
        idempotency_key: `checkout-${reservedCheckout.id}`,
      },
      environment: 'production',
    });
  });

  it('releases reservations when terminal checkout is canceled', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'checkout-1', ws_id: 'ws-1' },
      error: null,
    });

    await expect(
      syncInventorySquareTerminalCheckout(
        {
          device_options: { device_id: 'device-1' },
          id: 'terminal-checkout-1',
          order_id: 'order-1',
          status: 'CANCELED',
        } as never,
        {
          environment: 'production',
          wsId: 'ws-1',
        }
      )
    ).resolves.toBe(true);

    expect(mocks.selectEq).toHaveBeenCalledWith(
      'square_terminal_checkout_id',
      'terminal-checkout-1'
    );
    expect(mocks.selectSecondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.selectThirdEq).toHaveBeenCalledWith(
      'square_environment',
      'production'
    );
    expect(mocks.updateFirstEq).toHaveBeenCalledWith('id', 'checkout-1');
    expect(mocks.updateSecondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.releaseCheckout).toHaveBeenCalledWith('ws-1', 'checkout-1');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('tracks cancel-requested terminal status without releasing reservations early', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'checkout-1', ws_id: 'ws-1' },
      error: null,
    });

    await expect(
      syncInventorySquareTerminalCheckout(
        {
          id: 'terminal-checkout-1',
          status: 'CANCEL_REQUESTED',
        } as never,
        {
          environment: 'production',
          eventId: 'webhook-event-1',
          wsId: 'ws-1',
        }
      )
    ).resolves.toBe(true);

    expect(mocks.privateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        square_last_event_id: 'webhook-event-1',
        square_status: 'cancel_requested',
      })
    );
    expect(mocks.releaseCheckout).not.toHaveBeenCalled();
  });

  it('completes paid terminal checkouts idempotently through the private RPC', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'checkout-1', ws_id: 'ws-1' },
      error: null,
    });

    await expect(
      syncInventorySquareTerminalCheckout(
        {
          device_options: { device_id: 'device-1' },
          id: 'terminal-checkout-1',
          order_id: 'order-1',
          payment_ids: ['payment-1'],
          status: 'COMPLETED',
        } as never,
        {
          environment: 'production',
          wsId: 'ws-1',
        }
      )
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
      syncInventorySquarePayment(
        {
          id: 'payment-1',
          order_id: 'order-1',
          receipt_url: 'https://squareup.com/receipt',
          status: 'COMPLETED',
        } as never,
        {
          environment: 'production',
          wsId: 'ws-1',
        }
      )
    ).resolves.toBe(true);

    expect(mocks.selectEq).toHaveBeenCalledWith('square_order_id', 'order-1');
    expect(mocks.selectSecondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.selectThirdEq).toHaveBeenCalledWith(
      'square_environment',
      'production'
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_inventory_checkout_session_square_payment',
      expect.objectContaining({
        p_square_order_id: 'order-1',
        p_square_payment_id: 'payment-1',
      })
    );
  });
});

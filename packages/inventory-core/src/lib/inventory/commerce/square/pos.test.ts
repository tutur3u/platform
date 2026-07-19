import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertPosPayment,
  buildSquarePosLaunch,
  completeInventorySquarePosCallback,
  createInventorySquarePosCheckout,
  parseSquarePosCallback,
} from './pos';

const mocks = vi.hoisted(() => ({
  completeSquareCheckoutPayment: vi.fn(),
  getCheckoutById: vi.fn(),
  getInventorySquareAccessContextForEnvironment: vi.fn(),
  getInventorySquarePosContext: vi.fn(),
  getPrivateAdmin: vi.fn(),
  maybeSingle: vi.fn(),
  releaseCheckout: vi.fn(),
  retrieveSquareOrderApi: vi.fn(),
  retrieveSquarePaymentApi: vi.fn(),
  updateFirstEq: vi.fn(),
  updateSecondEq: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', () => ({ randomUUID: () => 'request-id' }));
vi.mock('../checkouts', () => ({
  getCheckoutById: (...args: unknown[]) => mocks.getCheckoutById(...args),
  releaseCheckout: (...args: unknown[]) => mocks.releaseCheckout(...args),
}));
vi.mock('./client', () => ({
  retrieveSquareOrderApi: (...args: unknown[]) =>
    mocks.retrieveSquareOrderApi(...args),
  retrieveSquarePaymentApi: (...args: unknown[]) =>
    mocks.retrieveSquarePaymentApi(...args),
}));
vi.mock('./connection-store', () => ({
  getInventorySquareAccessContextForEnvironment: (...args: unknown[]) =>
    mocks.getInventorySquareAccessContextForEnvironment(...args),
  getInventorySquarePosContext: (...args: unknown[]) =>
    mocks.getInventorySquarePosContext(...args),
}));
vi.mock('./settings-store', () => ({
  getPrivateAdmin: () => mocks.getPrivateAdmin(),
}));
vi.mock('./terminal', () => ({
  completeSquareCheckoutPayment: (...args: unknown[]) =>
    mocks.completeSquareCheckoutPayment(...args),
}));

const launchInput = {
  amount: 2599,
  applicationId: 'sq0idp-tuturuuu',
  callbackUrl:
    'https://inventory.tuturuuu.com/api/v1/inventory/square/pos/callback',
  currency: 'usd',
  fallbackUrl: 'https://store.tuturuuu.com/vaiolis/orders/order-token',
  locationId: 'location-1',
  note: 'Tuturuuu order order-token',
  requestState: 'order-token.request-id',
};

describe('Square POS mobile web contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateFirstEq.mockReturnValue({ eq: mocks.updateSecondEq });
    mocks.updateSecondEq.mockResolvedValue({ error: null });
    mocks.getPrivateAdmin.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
        })),
        update: vi.fn(() => ({ eq: mocks.updateFirstEq })),
      })),
    });
    mocks.getInventorySquareAccessContextForEnvironment.mockResolvedValue({
      accessToken: 'production-access-token',
    });
    mocks.getInventorySquarePosContext.mockResolvedValue({
      accessToken: 'production-access-token',
      applicationId: 'sq0idp-tuturuuu',
      environment: 'production',
      locationId: 'location-1',
    });
    mocks.retrieveSquareOrderApi.mockResolvedValue({
      id: 'square-order-1',
      location_id: 'location-1',
      state: 'COMPLETED',
      tenders: [{ payment_id: 'payment-1' }],
    });
    mocks.retrieveSquarePaymentApi.mockResolvedValue({
      amount_money: { amount: 2599, currency: 'USD' },
      id: 'payment-1',
      location_id: 'location-1',
      order_id: 'square-order-1',
      receipt_url: 'https://squareup.com/receipt/payment-1',
      source_type: 'CARD',
      status: 'COMPLETED',
    });
    mocks.completeSquareCheckoutPayment.mockResolvedValue(undefined);
  });

  it('builds Android and iOS card-only launch URLs with signed request state', () => {
    const launch = buildSquarePosLaunch(launchInput);

    expect(launch.androidUrl).toContain(
      'action=com.squareup.pos.action.CHARGE'
    );
    expect(launch.androidUrl).toContain('package=com.squareup');
    expect(launch.androidUrl).toContain('i.com.squareup.pos.TOTAL_AMOUNT=2599');
    expect(launch.androidUrl).toContain(
      'S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD'
    );
    expect(launch.androidUrl).toContain(
      'S.com.squareup.pos.REQUEST_METADATA=order-token.request-id'
    );
    expect(launch.androidUrl).toContain(
      `S.com.squareup.pos.WEB_CALLBACK_URI=${encodeURIComponent(
        launchInput.callbackUrl
      )}`
    );

    const ios = new URL(launch.iosUrl);
    const payload = JSON.parse(
      decodeURIComponent(ios.searchParams.get('data') ?? '')
    );
    expect(payload).toMatchObject({
      amount_money: { amount: 2599, currency_code: 'USD' },
      callback_url: launchInput.callbackUrl,
      client_id: launchInput.applicationId,
      location_id: launchInput.locationId,
      options: {
        auto_return: true,
        clear_default_fees: true,
        supported_tender_types: ['CREDIT_CARD'],
      },
      state: launchInput.requestState,
      version: '1.3',
    });
  });

  it('parses Android success and cancellation callbacks', () => {
    expect(
      parseSquarePosCallback(
        new URLSearchParams({
          'com.squareup.pos.CLIENT_TRANSACTION_ID': 'client-1',
          'com.squareup.pos.REQUEST_METADATA': 'order-token.request-id',
          'com.squareup.pos.SERVER_TRANSACTION_ID': 'square-order-1',
        })
      )
    ).toEqual({
      clientTransactionId: 'client-1',
      errorCode: null,
      errorDescription: null,
      requestState: 'order-token.request-id',
      transactionId: 'square-order-1',
    });

    expect(
      parseSquarePosCallback(
        new URLSearchParams({
          'com.squareup.pos.ERROR_CODE': 'TRANSACTION_CANCELED',
          'com.squareup.pos.ERROR_DESCRIPTION': 'Seller cancelled',
          'com.squareup.pos.REQUEST_METADATA': 'order-token.request-id',
        })
      )
    ).toMatchObject({
      errorCode: 'TRANSACTION_CANCELED',
      errorDescription: 'Seller cancelled',
      requestState: 'order-token.request-id',
    });
  });

  it('parses iOS callback JSON without trusting its status alone', () => {
    const data = encodeURIComponent(
      JSON.stringify({
        client_transaction_id: 'client-2',
        state: 'order-token.request-id',
        status: 'ok',
        transaction_id: 'square-order-2',
      })
    );

    expect(parseSquarePosCallback(new URLSearchParams({ data }))).toMatchObject(
      {
        clientTransactionId: 'client-2',
        errorCode: null,
        requestState: 'order-token.request-id',
        transactionId: 'square-order-2',
      }
    );
  });

  it('accepts only completed card payments matching order, location, amount, and currency', () => {
    expect(() =>
      assertPosPayment(
        {
          amount_money: { amount: 2599, currency: 'USD' },
          id: 'payment-1',
          location_id: 'location-1',
          order_id: 'square-order-1',
          source_type: 'CARD',
          status: 'COMPLETED',
        },
        {
          currency: 'USD',
          square_location_id: 'location-1',
          total_amount: 2599,
        },
        'square-order-1'
      )
    ).not.toThrow();

    expect(() =>
      assertPosPayment(
        {
          amount_money: { amount: 2500, currency: 'USD' },
          id: 'payment-2',
          location_id: 'location-1',
          order_id: 'square-order-1',
          source_type: 'CARD',
          status: 'COMPLETED',
        },
        {
          currency: 'USD',
          square_location_id: 'location-1',
          total_amount: 2599,
        },
        'square-order-1'
      )
    ).toThrow('amount does not match');
  });

  it('creates a production POS launch from a reserved checkout', async () => {
    const reservedCheckout = {
      currency: 'USD',
      id: 'checkout-1',
      publicToken: 'order-token',
      status: 'reserved',
      totalAmount: 2599,
      wsId: 'ws-1',
    };
    mocks.getCheckoutById
      .mockResolvedValueOnce(reservedCheckout)
      .mockResolvedValueOnce({
        ...reservedCheckout,
        checkoutProvider: 'square_pos',
        squareStatus: 'pending',
      });

    await expect(
      createInventorySquarePosCheckout({
        callbackUrl: launchInput.callbackUrl,
        checkoutId: 'checkout-1',
        fallbackUrl: launchInput.fallbackUrl,
        wsId: 'ws-1',
      })
    ).resolves.toMatchObject({
      checkout: { checkoutProvider: 'square_pos' },
      launch: {
        androidUrl: expect.stringContaining(
          'S.com.squareup.pos.REQUEST_METADATA=order-token.request-id'
        ),
      },
    });
    expect(mocks.getInventorySquarePosContext).toHaveBeenCalledWith('ws-1');
  });

  it('verifies Square order and card payment before completing inventory', async () => {
    const checkoutRow = {
      checkout_provider: 'square_pos',
      currency: 'USD',
      id: 'checkout-1',
      public_token: 'order-token',
      square_environment: 'production',
      square_location_id: 'location-1',
      square_order_id: null,
      square_pos_request_id: 'request-id',
      status: 'reserved',
      total_amount: 2599,
      ws_id: 'ws-1',
    };
    mocks.maybeSingle.mockResolvedValue({ data: checkoutRow, error: null });
    mocks.getCheckoutById.mockResolvedValue({
      id: 'checkout-1',
      publicToken: 'order-token',
      status: 'completed',
      wsId: 'ws-1',
    });

    await expect(
      completeInventorySquarePosCallback({
        clientTransactionId: 'client-1',
        errorCode: null,
        errorDescription: null,
        requestState: 'order-token.request-id',
        transactionId: 'square-order-1',
      })
    ).resolves.toMatchObject({ outcome: 'completed' });

    expect(mocks.retrieveSquareOrderApi).toHaveBeenCalledWith({
      accessToken: 'production-access-token',
      environment: 'production',
      orderId: 'square-order-1',
    });
    expect(mocks.retrieveSquarePaymentApi).toHaveBeenCalledWith({
      accessToken: 'production-access-token',
      environment: 'production',
      paymentId: 'payment-1',
    });
    expect(mocks.completeSquareCheckoutPayment).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      paymentId: 'payment-1',
      provider: 'square_pos',
      receiptUrl: 'https://squareup.com/receipt/payment-1',
      squareOrderId: 'square-order-1',
      wsId: 'ws-1',
    });
  });

  it('releases the reservation when Square POS reports cancellation', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        checkout_provider: 'square_pos',
        currency: 'USD',
        id: 'checkout-1',
        public_token: 'order-token',
        square_environment: 'production',
        square_location_id: 'location-1',
        square_order_id: null,
        square_pos_request_id: 'request-id',
        status: 'reserved',
        total_amount: 2599,
        ws_id: 'ws-1',
      },
      error: null,
    });
    mocks.releaseCheckout.mockResolvedValue({
      id: 'checkout-1',
      publicToken: 'order-token',
      status: 'cancelled',
    });

    await expect(
      completeInventorySquarePosCallback({
        clientTransactionId: null,
        errorCode: 'TRANSACTION_CANCELED',
        errorDescription: 'Seller cancelled',
        requestState: 'order-token.request-id',
        transactionId: null,
      })
    ).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(mocks.releaseCheckout).toHaveBeenCalledWith('ws-1', 'checkout-1');
    expect(mocks.completeSquareCheckoutPayment).not.toHaveBeenCalled();
  });
});

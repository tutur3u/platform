import { describe, expect, it } from 'vitest';
import {
  getPaymentReadinessScore,
  getPaymentsNextStep,
} from './payments-readiness';

describe('payment readiness', () => {
  it('guides a workspace through the safe Square setup sequence', () => {
    expect(
      getPaymentsNextStep({ checkouts: [], squareSettings: undefined })
    ).toBe('connectSandbox');
    expect(
      getPaymentsNextStep({
        checkouts: [],
        squareSettings: {
          connections: [{ environment: 'sandbox', status: 'ready' }],
        } as never,
        squareSync: { links: [] } as never,
      })
    ).toBe('importCatalog');
    expect(
      getPaymentsNextStep({
        checkouts: [],
        squareSettings: {
          connections: [{ environment: 'sandbox', status: 'ready' }],
        } as never,
        squareSync: { links: [{ productId: 'product-1' }] } as never,
      })
    ).toBe('runTerminalTest');
  });

  it('does not call a workspace production-ready from sandbox evidence', () => {
    expect(
      getPaymentsNextStep({
        checkouts: [{ squareEnvironment: 'sandbox' }] as never,
        squareSettings: {
          connections: [{ environment: 'sandbox', status: 'ready' }],
        } as never,
        squareSync: { links: [{ productId: 'product-1' }] } as never,
      })
    ).toBe('prepareProduction');
  });

  it('counts each independent safety signal once', () => {
    expect(
      getPaymentReadinessScore({
        polarSettings: {
          integrations: [{ status: 'ready' }],
        } as never,
        squareSettings: {
          connections: [
            {
              environment: 'sandbox',
              status: 'ready',
              webhookSignatureKeyLast4: '1234',
            },
          ],
          locationId: 'location-1',
          sandboxDeviceId: 'device-1',
        } as never,
        squareSync: { links: [{ productId: 'product-1' }] } as never,
      })
    ).toEqual({ completed: 6, percent: 100, total: 6 });
  });
});

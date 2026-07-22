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
          environment: 'sandbox',
          connections: [{ environment: 'sandbox', status: 'ready' }],
        } as never,
        squareSync: { environment: 'sandbox', links: [] } as never,
      })
    ).toBe('importCatalog');
    expect(
      getPaymentsNextStep({
        checkouts: [],
        squareSettings: {
          environment: 'sandbox',
          connections: [{ environment: 'sandbox', status: 'ready' }],
        } as never,
        squareSync: {
          environment: 'sandbox',
          links: [{ productId: 'product-1' }],
        } as never,
      })
    ).toBe('runTerminalTest');
  });

  it('does not call a workspace production-ready from sandbox evidence', () => {
    expect(
      getPaymentsNextStep({
        checkouts: [{ squareEnvironment: 'sandbox' }] as never,
        squareSettings: {
          environment: 'sandbox',
          connections: [{ environment: 'sandbox', status: 'ready' }],
        } as never,
        squareSync: {
          environment: 'sandbox',
          links: [{ productId: 'product-1' }],
        } as never,
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
          environment: 'sandbox',
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
        squareSync: {
          environment: 'sandbox',
          links: [{ productId: 'product-1' }],
        } as never,
      })
    ).toEqual({ completed: 6, percent: 100, total: 6 });
  });

  it('keeps Production gated until the physical terminal is paired', () => {
    const squareSettings = {
      connections: [
        {
          environment: 'production',
          status: 'ready',
          webhookSignatureKeyLast4: '1234',
        },
      ],
      deviceId: null,
      environment: 'production',
      locationId: 'production-location',
      readiness: { issues: ['device_missing'], ready: false },
    } as never;
    const squareSync = {
      environment: 'production',
      links: [{ productId: 'product-1' }],
    } as never;

    expect(
      getPaymentsNextStep({ checkouts: [], squareSettings, squareSync })
    ).toBe('pairProductionTerminal');
    expect(getPaymentReadinessScore({ squareSettings, squareSync })).toEqual({
      completed: 4,
      percent: 67,
      total: 6,
    });
  });

  it('accepts a ready same-device POS App path without claiming a Terminal is paired', () => {
    const squareSettings = {
      connections: [
        {
          environment: 'production',
          status: 'ready',
          webhookSignatureKeyLast4: '1234',
        },
      ],
      deviceId: null,
      environment: 'production',
      locationId: 'production-location',
      posReadiness: { issues: [], ready: true },
      readiness: { issues: ['device_missing'], ready: false },
    } as never;
    const squareSync = {
      environment: 'production',
      links: [{ productId: 'product-1' }],
    } as never;
    const polarSettings = {
      integrations: [{ status: 'ready' }],
    } as never;

    expect(
      getPaymentsNextStep({ checkouts: [], squareSettings, squareSync })
    ).toBe('monitor');
    expect(
      getPaymentReadinessScore({ polarSettings, squareSettings, squareSync })
    ).toEqual({
      completed: 6,
      percent: 100,
      total: 6,
    });
  });
});

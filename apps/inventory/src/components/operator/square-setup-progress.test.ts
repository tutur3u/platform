import { describe, expect, it } from 'vitest';
import {
  getEffectiveSquareSetupProgress,
  getSquareSetupProgress,
} from './square-setup-progress';

describe('getSquareSetupProgress', () => {
  it('requires a physical device for production readiness', () => {
    const progress = getSquareSetupProgress({
      appCredential: {
        applicationId: 'application-id',
        applicationSecretFingerprint: null,
        applicationSecretLast4: '1234',
        environment: 'production',
        oauthRedirectUrl: null,
        updatedAt: null,
        webhookNotificationUrl: null,
      },
      connection: {
        accessTokenFingerprint: null,
        accessTokenLast4: '1234',
        authMethod: 'oauth',
        environment: 'production',
        lastError: null,
        lastValidatedAt: null,
        merchantId: null,
        refreshTokenLast4: null,
        scopes: [],
        status: 'ready',
        tokenExpiresAt: null,
        updatedAt: null,
        webhookSignatureKeyLast4: '5678',
      },
      deviceId: null,
      environment: 'production',
      locationId: 'location-id',
      sandboxDeviceId: 'sandbox-device-id',
    });

    expect(progress.ready).toBe(false);
    expect(progress.firstIncompleteId).toBe('device');
  });

  it('accepts the Square simulator device in sandbox', () => {
    const progress = getSquareSetupProgress({
      connection: {
        accessTokenFingerprint: null,
        accessTokenLast4: '1234',
        authMethod: 'manual',
        environment: 'sandbox',
        lastError: null,
        lastValidatedAt: null,
        merchantId: null,
        refreshTokenLast4: null,
        scopes: [],
        status: 'ready',
        tokenExpiresAt: null,
        updatedAt: null,
        webhookSignatureKeyLast4: '5678',
      },
      deviceId: null,
      environment: 'sandbox',
      locationId: 'location-id',
      sandboxDeviceId: 'sandbox-device-id',
    });

    expect(progress.ready).toBe(true);
    expect(progress.completed).toBe(progress.total);
  });

  it('uses the POS App as an alternate device path without completing unrelated checks', () => {
    const progress = getSquareSetupProgress({
      connection: {
        accessTokenFingerprint: null,
        accessTokenLast4: '1234',
        authMethod: 'manual',
        environment: 'production',
        lastError: null,
        lastValidatedAt: null,
        merchantId: null,
        refreshTokenLast4: null,
        scopes: [],
        status: 'ready',
        tokenExpiresAt: null,
        updatedAt: null,
        webhookSignatureKeyLast4: null,
      },
      deviceId: null,
      environment: 'production',
      locationId: 'location-id',
      sandboxDeviceId: null,
    });

    const effective = getEffectiveSquareSetupProgress({
      posReady: true,
      progress,
    });

    expect(effective.devicePath).toBe('pos_app');
    expect(effective.steps.find((step) => step.id === 'device')?.complete).toBe(
      true
    );
    expect(
      effective.steps.find((step) => step.id === 'webhook')?.complete
    ).toBe(false);
    expect(effective.ready).toBe(false);
    expect(effective.firstIncompleteId).toBe('webhook');
  });
});

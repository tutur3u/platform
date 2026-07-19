import { describe, expect, it, vi } from 'vitest';
import type { SquareAppCredentialRow } from './app-credentials-store';
import type { SquareConnectionRow } from './connection-store';
import { computePosReadiness, computeReadiness } from './settings';
import {
  mergeSquareSettingsRow,
  type SquareSettingsRow,
} from './settings-contract';

vi.mock('server-only', () => ({}));
vi.mock('./app-credentials-store', () => ({
  hasUsableSquareAppCredentials: (row: SquareAppCredentialRow | undefined) =>
    Boolean(row?.application_id && row.application_secret_encrypted),
}));
vi.mock('./connection-store', () => ({}));
vi.mock('./settings-store', () => ({}));

const settings: SquareSettingsRow = {
  device_id: 'device-1',
  device_name: 'Front counter',
  environment: 'sandbox',
  location_id: 'location-1',
  location_name: 'Main',
  sandbox_device_id: null,
};

const baseConnection: SquareConnectionRow = {
  access_token_encrypted: 'encrypted-token',
  access_token_fingerprint: 'token-fingerprint',
  access_token_last4: '1234',
  auth_method: 'oauth',
  environment: 'sandbox',
  id: 'connection-1',
  last_error: null,
  last_validated_at: '2026-06-28T00:00:00.000Z',
  merchant_id: 'merchant-1',
  refresh_token_encrypted: 'encrypted-refresh-token',
  refresh_token_last4: '5678',
  scopes: [
    'MERCHANT_PROFILE_READ',
    'ORDERS_READ',
    'ORDERS_WRITE',
    'PAYMENTS_READ',
    'PAYMENTS_WRITE',
    'DEVICE_CREDENTIAL_MANAGEMENT',
  ],
  status: 'ready',
  token_expires_at: '2026-06-29T00:00:00.000Z',
  updated_at: '2026-06-28T00:00:00.000Z',
  webhook_signature_key_encrypted: 'encrypted-webhook-key',
  webhook_signature_key_last4: 'abcd',
  ws_id: 'workspace-1',
};

const appCredential: SquareAppCredentialRow = {
  application_id: 'square-app-id',
  application_secret_encrypted: 'encrypted-app-secret',
  application_secret_fingerprint: 'secret-fingerprint',
  application_secret_last4: 'cret',
  environment: 'sandbox',
  oauth_redirect_url: null,
  updated_at: '2026-06-28T00:00:00.000Z',
  webhook_notification_url: null,
  ws_id: 'workspace-1',
};

describe('Square readiness', () => {
  it('requires workspace app credentials for OAuth connections', () => {
    expect(
      computeReadiness({
        appCredentials: [],
        connections: [baseConnection],
        settings,
      })
    ).toEqual({
      issues: ['app_credentials_missing'],
      ready: false,
    });
  });

  it('does not require workspace app credentials for manual-token connections', () => {
    expect(
      computeReadiness({
        appCredentials: [],
        connections: [
          {
            ...baseConnection,
            auth_method: 'manual',
            refresh_token_encrypted: null,
            refresh_token_last4: null,
          },
        ],
        settings,
      })
    ).toEqual({
      issues: [],
      ready: true,
    });
  });

  it('accepts OAuth connections with saved workspace app credentials', () => {
    expect(
      computeReadiness({
        appCredentials: [appCredential],
        connections: [baseConnection],
        settings,
      })
    ).toEqual({
      issues: [],
      ready: true,
    });
  });
});

describe('Square POS app readiness', () => {
  const productionConnection = {
    ...baseConnection,
    environment: 'production' as const,
  };
  const productionCredential = {
    ...appCredential,
    environment: 'production' as const,
  };
  const productionSettings = {
    ...settings,
    environment: 'production' as const,
  };

  it('does not require a Terminal API device or webhook key', () => {
    expect(
      computePosReadiness({
        appCredentials: [productionCredential],
        connections: [
          { ...productionConnection, webhook_signature_key_encrypted: null },
        ],
        settings: {
          ...productionSettings,
          device_id: null,
          device_name: null,
        },
      })
    ).toEqual({ issues: [], ready: true });
  });

  it('requires production, app ID, location, and read scopes for verification', () => {
    expect(
      computePosReadiness({
        appCredentials: [],
        connections: [
          {
            ...productionConnection,
            scopes: ['MERCHANT_PROFILE_READ'],
          },
        ],
        settings: { ...settings, location_id: null },
      })
    ).toEqual({
      issues: expect.arrayContaining([
        'production_required',
        'app_credentials_missing',
        'location_missing',
        'scopes_missing',
      ]),
      ready: false,
    });
  });
});

describe('Square environment routing', () => {
  it('preserves routing defaults while saving the same environment', () => {
    expect(mergeSquareSettingsRow({ current: settings, payload: {} })).toEqual(
      settings
    );
  });

  it('clears location and physical device defaults when environments change', () => {
    expect(
      mergeSquareSettingsRow({
        current: settings,
        payload: { environment: 'production' },
      })
    ).toEqual({
      ...settings,
      device_id: null,
      device_name: null,
      environment: 'production',
      location_id: null,
      location_name: null,
    });
  });

  it('accepts explicit routing for the new environment and preserves the sandbox simulator', () => {
    expect(
      mergeSquareSettingsRow({
        current: { ...settings, sandbox_device_id: 'sandbox-simulator' },
        payload: {
          deviceId: 'production-device',
          deviceName: 'Front counter',
          environment: 'production',
          locationId: 'production-location',
          locationName: 'Retail store',
        },
      })
    ).toMatchObject({
      device_id: 'production-device',
      environment: 'production',
      location_id: 'production-location',
      sandbox_device_id: 'sandbox-simulator',
    });
  });
});

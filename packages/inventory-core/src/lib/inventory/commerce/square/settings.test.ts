import { describe, expect, it, vi } from 'vitest';
import type { SquareAppCredentialRow } from './app-credentials-store';
import type { SquareConnectionRow } from './connection-store';
import { computeReadiness } from './settings';
import type { SquareSettingsRow } from './settings-store';

vi.mock('server-only', () => ({}));

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

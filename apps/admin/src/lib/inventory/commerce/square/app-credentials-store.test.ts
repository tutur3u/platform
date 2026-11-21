import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSquareOAuthAppConfig,
  mapAppCredential,
  type SquareAppCredentialRow,
  saveSquareAppCredentials,
} from './app-credentials-store';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  decryptField: vi.fn(),
  encryptField: vi.fn(),
  from: vi.fn(),
  getOrCreateWorkspaceKey: vi.fn(),
  getPrivateAdmin: vi.fn(),
  getWorkspaceKey: vi.fn(),
  order: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@tuturuuu/utils/encryption', () => ({
  decryptField: (...args: Parameters<typeof mocks.decryptField>) =>
    mocks.decryptField(...args),
  encryptField: (...args: Parameters<typeof mocks.encryptField>) =>
    mocks.encryptField(...args),
}));

vi.mock('@/lib/workspace-encryption', () => ({
  getOrCreateWorkspaceKey: (
    ...args: Parameters<typeof mocks.getOrCreateWorkspaceKey>
  ) => mocks.getOrCreateWorkspaceKey(...args),
  getWorkspaceKey: (...args: Parameters<typeof mocks.getWorkspaceKey>) =>
    mocks.getWorkspaceKey(...args),
}));

vi.mock('./settings-store', () => ({
  getPrivateAdmin: () => mocks.getPrivateAdmin(),
}));

const storedCredential: SquareAppCredentialRow = {
  application_id: 'square-app-id',
  application_secret_encrypted: 'encrypted-secret',
  application_secret_fingerprint: 'secret-fingerprint',
  application_secret_last4: 'cret',
  environment: 'sandbox',
  oauth_redirect_url: null,
  updated_at: '2026-06-28T00:00:00.000Z',
  webhook_notification_url: null,
  ws_id: 'workspace-1',
};

function primeRows(rows = [storedCredential]) {
  mocks.order.mockResolvedValue({ data: rows, error: null });
  mocks.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: mocks.order,
      })),
    })),
    upsert: mocks.upsert,
  });
  mocks.getPrivateAdmin.mockResolvedValue({
    from: mocks.from,
  });
}

describe('Square workspace app credentials store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptField.mockReturnValue('decrypted-app-secret');
    mocks.encryptField.mockReturnValue('encrypted-new-secret');
    mocks.getOrCreateWorkspaceKey.mockResolvedValue('workspace-key');
    mocks.getWorkspaceKey.mockResolvedValue('workspace-key');
    mocks.upsert.mockResolvedValue({ error: null });
    primeRows();
  });

  it('maps app credential rows without exposing encrypted secrets', () => {
    expect(mapAppCredential(storedCredential)).toEqual({
      applicationId: 'square-app-id',
      applicationSecretFingerprint: 'secret-fingerprint',
      applicationSecretLast4: 'cret',
      environment: 'sandbox',
      oauthRedirectUrl: null,
      updatedAt: '2026-06-28T00:00:00.000Z',
      webhookNotificationUrl: null,
    });
  });

  it('loads OAuth config from workspace storage and derives the default redirect URL', async () => {
    await expect(
      getSquareOAuthAppConfig({
        environment: 'sandbox',
        origin: 'https://inventory.example.com/',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      applicationId: 'square-app-id',
      applicationSecret: 'decrypted-app-secret',
      redirectUrl:
        'https://inventory.example.com/api/v1/inventory/square/oauth/callback',
    });

    expect(mocks.decryptField).toHaveBeenCalledWith(
      'encrypted-secret',
      'workspace-key'
    );
  });

  it('encrypts application secrets and stores only secret metadata with workspace scope', async () => {
    await saveSquareAppCredentials({
      environment: 'production',
      payload: {
        applicationId: 'production-app-id',
        applicationSecret: 'production-app-secret',
        environment: 'production',
        oauthRedirectUrl:
          'https://inventory.example.com/api/v1/inventory/square/oauth/callback',
        webhookNotificationUrl:
          'https://inventory.example.com/api/v1/inventory/square/webhook/workspace-1',
      },
      userId: 'user-1',
      wsId: 'workspace-1',
    });

    expect(mocks.encryptField).toHaveBeenCalledWith(
      'production-app-secret',
      'workspace-key'
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        application_id: 'production-app-id',
        application_secret_encrypted: 'encrypted-new-secret',
        application_secret_last4: 'cret',
        environment: 'production',
        oauth_redirect_url:
          'https://inventory.example.com/api/v1/inventory/square/oauth/callback',
        updated_by: 'user-1',
        webhook_notification_url:
          'https://inventory.example.com/api/v1/inventory/square/webhook/workspace-1',
        ws_id: 'workspace-1',
      }),
      { onConflict: 'ws_id,environment' }
    );
  });
});

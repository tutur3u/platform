import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptDataKey: vi.fn(),
  decryptSecretValue: vi.fn(),
  getEnvironment: vi.fn(),
  getVersion: vi.fn(),
  listSecrets: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('./crypto', () => ({
  decryptDataKey: mocks.decryptDataKey,
  decryptSecretValue: mocks.decryptSecretValue,
}));
vi.mock('./store', () => ({
  getProductionEnvironment: mocks.getEnvironment,
  getVersionById: mocks.getVersion,
  listSecretsForVersion: mocks.listSecrets,
  recordAudit: mocks.recordAudit,
  MobileDeploymentStoreError: class MobileDeploymentStoreError extends Error {
    constructor(
      message: string,
      public readonly status = 409,
      public readonly code = 'store_error'
    ) {
      super(message);
    }
  },
}));

import { exportActiveMobileDartDefines } from './admin-env-export';

describe('admin mobile configuration export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnvironment.mockResolvedValue({
      id: 'production',
      active_version_id: 'version-3',
    });
    mocks.getVersion.mockResolvedValue({
      id: 'version-3',
      version: 3,
      data_key_ciphertext: 'encrypted-key',
    });
    mocks.decryptDataKey.mockResolvedValue('key');
    mocks.listSecrets.mockResolvedValue([
      { kind: 'env', name: 'API_BASE_URL', encrypted_value: 'api' },
      { kind: 'env', name: 'NEXT_PUBLIC_SUPABASE_URL', encrypted_value: 'url' },
      {
        kind: 'env',
        name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        encrypted_value: 'public-key',
      },
      {
        kind: 'scalar',
        name: 'ANDROID_KEYSTORE_PASSWORD',
        encrypted_value: 'signing-secret',
      },
    ]);
    mocks.decryptSecretValue.mockImplementation((value: string) => value);
  });

  it('returns the active env file without decrypting signing scalars', async () => {
    const result = await exportActiveMobileDartDefines({
      db: {} as never,
      userId: 'admin-1',
    });
    expect(result.versionNumber).toBe(3);
    expect(result.envFile).toContain('API_BASE_URL=api');
    expect(result.envFile).not.toContain('ANDROID_KEYSTORE_PASSWORD');
    expect(mocks.decryptSecretValue).not.toHaveBeenCalledWith(
      'signing-secret',
      'key'
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorUserId: 'admin-1',
        eventType: 'env.exported',
      })
    );
  });

  it('refuses an inactive vault version', async () => {
    mocks.getVersion.mockResolvedValue(null);
    await expect(
      exportActiveMobileDartDefines({ db: {} as never, userId: 'admin-1' })
    ).rejects.toMatchObject({ code: 'no_active_version' });
    expect(mocks.listSecrets).not.toHaveBeenCalled();
  });
});

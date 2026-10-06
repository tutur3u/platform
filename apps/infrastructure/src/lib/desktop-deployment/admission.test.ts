import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  decryptKey: vi.fn(),
  decryptResource: vi.fn(),
  encryptResource: vi.fn(),
  certificate: vi.fn(),
  notarization: vi.fn(),
  createKey: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./vault-crypto', () => ({
  decryptDesktopDataKey: mock.decryptKey,
  decryptDesktopResource: mock.decryptResource,
  encryptDesktopResource: mock.encryptResource,
  createDesktopDataKey: mock.createKey,
}));
vi.mock('./certificate-readiness', () => ({
  inspectDesktopCertificate: mock.certificate,
  inspectNotarizationKey: mock.notarization,
}));

import { setDesktopDelivery } from './admission';

function fixture(platform: 'windows' | 'macos' = 'windows') {
  const names =
    platform === 'windows'
      ? [
          'windows_authenticode_certificate_pfx',
          'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
        ]
      : [
          'macos_developer_id_certificate_p12',
          'macos_notarization_private_key_p8',
          'MACOS_CERTIFICATE_PASSWORD',
          'MACOS_SIGNING_IDENTITY',
          'APPLE_TEAM_ID',
          'APP_STORE_CONNECT_API_KEY_ID',
          'APP_STORE_CONNECT_ISSUER_ID',
        ];
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const query = (table: string) => {
    const result =
      table === 'desktop_deployment_versions'
        ? {
            id: 'version',
            platform,
            status: 'active',
            validated_revision: 7,
            validation_errors: [],
            revision: 7,
            data_key_ciphertext: 'wrapped',
          }
        : names.map((name) => ({
            name,
            encrypted_value: name,
            plaintext_sha256: 'sha',
            plaintext_size: 1,
          }));
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: result, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are deliberately awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: result, error: null }).then(resolve),
    };
    return chain;
  };
  return {
    db: {
      schema: () => ({ from: query, rpc }),
    } as unknown as SupabaseClient<Database>,
    rpc,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.decryptKey.mockResolvedValue(Buffer.alloc(32, 1));
  mock.decryptResource.mockImplementation((_value, _key, identity) =>
    Buffer.from(
      identity.name === 'MACOS_SIGNING_IDENTITY'
        ? 'Developer ID Application: Fixture'
        : identity.name === 'APPLE_TEAM_ID' ||
            identity.name === 'APP_STORE_CONNECT_API_KEY_ID'
          ? 'ABCDEFGHIJ'
          : identity.name === 'APP_STORE_CONNECT_ISSUER_ID'
            ? '00000000-0000-4000-8000-000000000001'
            : 'fixture'
    )
  );
  mock.certificate.mockReturnValue({
    ok: true,
    certificate: { expiresAt: '2099-01-01T00:00:00.000Z' },
  });
  mock.notarization.mockReturnValue({ ok: true });
  mock.encryptResource.mockReturnValue({
    ciphertext: 'encrypted',
    sha256: 'sha',
    size: 1,
  });
});

const enable = {
  action: 'enable_delivery' as const,
  platform: 'windows' as const,
  environmentRevision: 2,
  versionId: 'version',
  revision: 7,
};
describe('fresh material admission', () => {
  it('uses nested certificate expiry in trusted receipt and wipes decrypted material', async () => {
    const { db, rpc } = fixture();
    await setDesktopDelivery(db, 'actor', enable);
    expect(rpc).toHaveBeenCalledWith(
      'desktop_deployment_set_delivery',
      expect.objectContaining({
        p_actor: 'actor',
        p_platform: 'windows',
        p_environment_revision: 2,
        p_enabled: true,
        p_version: 'version',
        p_version_revision: 7,
        p_material_valid_until: '2099-01-01T00:00:00.000Z',
        p_verified_at: expect.any(String),
      })
    );
    for (const value of mock.decryptResource.mock.results)
      expect(value.value.every((byte: number) => byte === 0)).toBe(true);
    const decrypted = mock.decryptKey.mock.results[0];
    if (decrypted?.type !== 'return')
      throw new Error('Expected a successful key decryption');
    expect((await decrypted.value).every((byte: number) => byte === 0)).toBe(
      true
    );
  });
  it('disables without looking up or decrypting credentials', async () => {
    const { db, rpc } = fixture();
    await setDesktopDelivery(db, 'actor', {
      action: 'disable_delivery',
      platform: 'macos',
      environmentRevision: 3,
    });
    expect(mock.decryptKey).not.toHaveBeenCalled();
    expect(mock.certificate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('desktop_deployment_set_delivery', {
      p_actor: 'actor',
      p_platform: 'macos',
      p_environment_revision: 3,
      p_enabled: false,
    });
  });
  it('rejects stale active material before decrypting', async () => {
    const { db, rpc } = fixture();
    await expect(
      setDesktopDelivery(db, 'actor', { ...enable, revision: 6 })
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.decryptKey).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects expired material before enabling and wipes bytes', async () => {
    const { db, rpc } = fixture();
    mock.certificate.mockReturnValue({
      ok: false,
      code: 'certificate_expired',
    });
    await expect(setDesktopDelivery(db, 'actor', enable)).rejects.toMatchObject(
      { status: 409 }
    );
    expect(rpc).not.toHaveBeenCalled();
    for (const value of mock.decryptResource.mock.results)
      expect(value.value.every((byte: number) => byte === 0)).toBe(true);
  });
  it('requires a valid P8 as well as certificate for macOS', async () => {
    const { db, rpc } = fixture('macos');
    mock.notarization.mockReturnValue({
      ok: false,
      code: 'notarization_key_invalid',
    });
    await expect(
      setDesktopDelivery(db, 'actor', { ...enable, platform: 'macos' })
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('preserves authoritative SQL revision conflict after material inspection', async () => {
    const { db, rpc } = fixture();
    rpc.mockResolvedValue({ error: { code: '40001' } });
    await expect(setDesktopDelivery(db, 'actor', enable)).rejects.toMatchObject(
      { status: 409 }
    );
  });
  it('sanitizes decrypt failures without forwarding raw errors', async () => {
    const { db, rpc } = fixture();
    mock.decryptKey.mockRejectedValue(new Error('private raw value'));
    await expect(setDesktopDelivery(db, 'actor', enable)).rejects.toMatchObject(
      { status: 500, code: 'desktop_admission_unavailable' }
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

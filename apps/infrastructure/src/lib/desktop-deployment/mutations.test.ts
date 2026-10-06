import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

import { applyDesktopMutation, saveDesktopResource } from './mutations';

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
            status: 'draft',
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
  mock.certificate.mockReturnValue({ ok: true });
  mock.notarization.mockReturnValue({ ok: true });
  mock.encryptResource.mockReturnValue({
    ciphertext: 'encrypted',
    sha256: 'sha',
    size: 1,
  });
});

describe('revision-fenced desktop administration', () => {
  it('issues a one-time token whose lookup prefix matches the actual SQL constraint', async () => {
    const { db, rpc } = fixture();
    const migration = readFileSync(
      'apps/database/supabase/migrations/20261006010001_desktop_deployment_vault.sql',
      'utf8'
    );
    const pattern = migration.match(
      /token_prefix text NOT NULL CHECK \(token_prefix ~ '([^']+)'\)/
    )?.[1];
    expect(pattern).toBeDefined();
    const token = await applyDesktopMutation(db, 'actor', {
      action: 'create_token',
      versionId: 'version',
      expiresAt: '2026-10-07T00:00:00Z',
    });
    expect(token).toMatch(/^ttr_desktop_ci_[A-Za-z0-9_-]{43}$/u);
    const args = rpc.mock.calls[0]?.[1];
    expect(args.p_prefix).toHaveLength(32);
    expect(args.p_prefix).toMatch(new RegExp(pattern!));
    expect(token?.startsWith(args.p_prefix)).toBe(true);
    expect(args.p_hash).toBe(createHash('sha256').update(token!).digest('hex'));
    expect(JSON.stringify(args)).not.toContain(token);
  });
  it('rejects a stale write before decryption or mutation', async () => {
    const { db, rpc } = fixture();
    await expect(
      saveDesktopResource(db, 'actor', {
        versionId: 'version',
        revision: 6,
        name: 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
        bytes: Buffer.from('value'),
        kind: 'scalar',
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.decryptKey).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects another platform resource and malformed UTF-8 before encryption', async () => {
    const { db, rpc } = fixture();
    await expect(
      saveDesktopResource(db, 'actor', {
        versionId: 'version',
        revision: 7,
        name: 'APPLE_TEAM_ID',
        bytes: Buffer.from('ABCDEFGHIJ'),
        kind: 'scalar',
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      saveDesktopResource(db, 'actor', {
        versionId: 'version',
        revision: 7,
        name: 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
        bytes: Buffer.from([0xff]),
        kind: 'scalar',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('publishes writes through actor/revision CAS and wipes the unwrapped key on failure', async () => {
    const { db, rpc } = fixture();
    const key = Buffer.alloc(32, 1);
    mock.decryptKey.mockResolvedValue(key);
    rpc.mockResolvedValue({ data: null, error: { code: '40001' } });
    await expect(
      saveDesktopResource(db, 'actor', {
        versionId: 'version',
        revision: 7,
        name: 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
        bytes: Buffer.from('value'),
        kind: 'scalar',
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledWith(
      'desktop_deployment_write_resource',
      expect.objectContaining({ p_actor: 'actor', p_revision: 7 })
    );
    expect(key.every((byte) => byte === 0)).toBe(true);
  });
  it('rechecks expiry at activation, records fixed rejection and never activates', async () => {
    const { db, rpc } = fixture();
    mock.certificate.mockReturnValue({
      ok: false,
      code: 'certificate_expired',
    });
    await expect(
      applyDesktopMutation(db, 'actor', {
        action: 'activate',
        versionId: 'version',
        revision: 7,
      })
    ).rejects.toMatchObject({ code: 'desktop_version_not_ready' });
    expect(rpc).toHaveBeenCalledWith('desktop_deployment_validate_version', {
      p_actor: 'actor',
      p_version: 'version',
      p_revision: 7,
      p_errors: ['certificate_expired'],
    });
    expect(rpc).not.toHaveBeenCalledWith(
      'desktop_deployment_activate_version',
      expect.anything()
    );
  });
  it('rejects a concurrent edit at validation instead of activating older material', async () => {
    const { db, rpc } = fixture();
    rpc.mockResolvedValue({ error: { code: '40001' } });
    await expect(
      applyDesktopMutation(db, 'actor', {
        action: 'activate',
        versionId: 'version',
        revision: 7,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledOnce();
  });
  it('requires both macOS certificate identity and notarization material before activation', async () => {
    const { db, rpc } = fixture('macos');
    mock.notarization.mockReturnValue({
      ok: false,
      code: 'notarization_key_invalid',
    });
    await expect(
      applyDesktopMutation(db, 'actor', {
        action: 'activate',
        versionId: 'version',
        revision: 7,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.certificate).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'macos',
        identity: 'Developer ID Application: Fixture',
        teamId: 'ABCDEFGHIJ',
      })
    );
    expect(rpc).not.toHaveBeenCalledWith(
      'desktop_deployment_activate_version',
      expect.anything()
    );
  });
  it('never creates an enabling RPC while activating a validated revision', async () => {
    const { db, rpc } = fixture();
    await applyDesktopMutation(db, 'actor', {
      action: 'activate',
      versionId: 'version',
      revision: 7,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'desktop_deployment_validate_version',
      'desktop_deployment_activate_version',
    ]);
    for (const call of mock.decryptResource.mock.results)
      expect(call.value.every((byte: number) => byte === 0)).toBe(true);
  });
});

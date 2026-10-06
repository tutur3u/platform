import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopAdminDb } from './access';
import {
  DESKTOP_DEPLOYMENT_WORKFLOW_REF,
  DESKTOP_SIGNING_PROFILES,
} from './contract';
import type { DesktopDeploymentClaims } from './oidc-claims';

const mock = vi.hoisted(() => ({
  key: vi.fn(),
  resource: vi.fn(),
  certificate: vi.fn(),
  notarization: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./vault-crypto', () => ({
  decryptDesktopDataKey: mock.key,
  decryptDesktopResource: mock.resource,
}));
vi.mock('./certificate-readiness', () => ({
  inspectDesktopCertificate: mock.certificate,
  inspectNotarizationKey: mock.notarization,
}));

import { fetchDesktopSigningBundle } from './bundle-store';

const token = `ttr_desktop_ci_${'a'.repeat(43)}`;
const claims: DesktopDeploymentClaims = {
  actor: 'test',
  runId: '123',
  runAttempt: '2',
  sha: 'a'.repeat(40),
  workflowRef: DESKTOP_DEPLOYMENT_WORKFLOW_REF,
};
function fixture(platform: 'windows' | 'macos' = 'windows') {
  const profile = DESKTOP_SIGNING_PROFILES[platform];
  const tables: Record<
    string,
    { data: unknown; error: { code: string } | null }
  > = {
    desktop_deployment_ci_tokens: {
      data: {
        id: 'token-id',
        platform,
        version_id: 'version',
        token_hash: createHash('sha256').update(token).digest('hex'),
      },
      error: null,
    },
    desktop_deployment_versions: {
      data: {
        id: 'version',
        platform,
        status: 'active',
        data_key_ciphertext: 'wrapped',
      },
      error: null,
    },
    desktop_deployment_resources: {
      data: [...profile.files, ...profile.scalars].map((name) => ({
        name,
        encrypted_value: name,
        plaintext_sha256: 'digest',
        plaintext_size: 1,
      })),
      error: null,
    },
  };
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: () => Promise.resolve(tables[table]),
      // biome-ignore lint/suspicious/noThenProperty: model the real awaitable query builder.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(tables[table]).then(resolve),
    };
    return chain;
  });
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === 'desktop_deployment_reserve_bundle'
        ? { id: 'lease', platform, version_id: 'version' }
        : null,
    error: null as { code: string } | null,
  }));
  return {
    tables,
    from,
    rpc,
    db: { schema: () => ({ from, rpc }) } as unknown as DesktopAdminDb,
    platform,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.key.mockResolvedValue(Buffer.alloc(32, 1));
  mock.resource.mockImplementation((_cipher, _key, identity) =>
    Buffer.from(
      identity.name === 'MACOS_SIGNING_IDENTITY'
        ? 'Developer ID Application: Fixture'
        : identity.name === 'APPLE_TEAM_ID' ||
            identity.name === 'APP_STORE_CONNECT_API_KEY_ID'
          ? 'ABCDEFGHIJ'
          : identity.name === 'APP_STORE_CONNECT_ISSUER_ID'
            ? '00000000-0000-4000-8000-000000000001'
            : 'synthetic'
    )
  );
  mock.certificate.mockReturnValue({ ok: true });
  mock.notarization.mockReturnValue({ ok: true });
});
describe('one-use protected desktop signing bundle', () => {
  it.each(['windows', 'macos'] as const)(
    'projects exact %s resources only after final admission and wipes decrypted buffers',
    async (platform) => {
      const f = fixture(platform);
      const result = await fetchDesktopSigningBundle({ ...f, token, claims });
      expect(result.files.map((file) => file.name)).toEqual(
        DESKTOP_SIGNING_PROFILES[platform].files
      );
      expect(Object.keys(result.scalars)).toEqual(
        DESKTOP_SIGNING_PROFILES[platform].scalars
      );
      expect(f.rpc).toHaveBeenNthCalledWith(
        1,
        'desktop_deployment_reserve_bundle',
        {
          p_token: 'token-id',
          p_platform: platform,
          p_run_id: '123',
          p_attempt: '2',
          p_sha: claims.sha,
        }
      );
      expect(f.rpc).toHaveBeenLastCalledWith(
        'desktop_deployment_complete_bundle',
        { p_lease: 'lease' }
      );
      expect(result.files[0]?.base64).toBe(
        Buffer.from('synthetic').toString('base64')
      );
      await expect(mock.key.mock.results[0]?.value).resolves.toEqual(
        Buffer.alloc(32)
      );
      for (const call of mock.resource.mock.results)
        expect(call.value).toEqual(Buffer.alloc(call.value.length));
      expect(JSON.stringify(result)).not.toContain('wrapped');
    }
  );
  it('rejects malformed token before database access', async () => {
    const f = fixture();
    await expect(
      fetchDesktopSigningBundle({ ...f, token: 'wrong', claims })
    ).rejects.toMatchObject({ status: 401 });
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(['hash', 'platform', 'absent'] as const)(
    'denies %s mismatch before reservation/decryption',
    async (kind) => {
      const f = fixture();
      const row = f.tables.desktop_deployment_ci_tokens!.data as Record<
        string,
        unknown
      >;
      if (kind === 'hash') row.token_hash = '0'.repeat(64);
      if (kind === 'platform') row.platform = 'macos';
      if (kind === 'absent') f.tables.desktop_deployment_ci_tokens!.data = null;
      await expect(
        fetchDesktopSigningBundle({ ...f, token, claims })
      ).rejects.toMatchObject({ status: 401 });
      expect(f.rpc).not.toHaveBeenCalled();
      expect(mock.key).not.toHaveBeenCalled();
    }
  );
  it.each(['42501', '23505'])(
    'denies disabled/replayed lease %s before key decryption',
    async (code) => {
      const f = fixture();
      f.rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(
        fetchDesktopSigningBundle({ ...f, token, claims })
      ).rejects.toMatchObject({ status: code === '42501' ? 403 : 409 });
      expect(mock.key).not.toHaveBeenCalled();
    }
  );
  it.each(['extra', 'duplicate', 'inactive'] as const)(
    'consumes %s material failure before decrypting',
    async (kind) => {
      const f = fixture();
      const resources = f.tables.desktop_deployment_resources!.data as {
        name: string;
      }[];
      if (kind === 'extra') resources.push({ name: 'mobile_play_key' });
      if (kind === 'duplicate') resources[1]!.name = resources[0]!.name;
      if (kind === 'inactive')
        (
          f.tables.desktop_deployment_versions!.data as Record<string, unknown>
        ).status = 'draft';
      await expect(
        fetchDesktopSigningBundle({ ...f, token, claims })
      ).rejects.toMatchObject({ status: 409 });
      expect(mock.key).not.toHaveBeenCalled();
      expect(f.rpc).toHaveBeenLastCalledWith(
        'desktop_deployment_complete_bundle',
        { p_lease: 'lease', p_failure_code: 'material_or_admission_failed' }
      );
    }
  );
  it.each(['certificate', 'notarization'] as const)(
    'rechecks %s material at fetch time and consumes failure',
    async (kind) => {
      const f = fixture('macos');
      mock[kind].mockReturnValue({ ok: false, code: 'synthetic-invalid' });
      await expect(
        fetchDesktopSigningBundle({ ...f, token, claims })
      ).rejects.toMatchObject({ status: 409 });
      expect(f.rpc).toHaveBeenLastCalledWith(
        'desktop_deployment_complete_bundle',
        { p_lease: 'lease', p_failure_code: 'material_or_admission_failed' }
      );
      for (const call of mock.resource.mock.results)
        expect(call.value).toEqual(Buffer.alloc(call.value.length));
    }
  );
  it('does not return bytes when revocation occurs before final completion', async () => {
    const f = fixture();
    const original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name) =>
      name === 'desktop_deployment_complete_bundle' &&
      f.rpc.mock.calls.length === 2
        ? { data: null, error: { code: '42501' } }
        : original(name)
    );
    await expect(
      fetchDesktopSigningBundle({ ...f, token, claims })
    ).rejects.toMatchObject({ status: 403 });
    for (const call of mock.resource.mock.results)
      expect(call.value).toEqual(Buffer.alloc(call.value.length));
  });
  it('never propagates private decoder/provider diagnostics', async () => {
    const f = fixture();
    mock.resource.mockImplementation(() => {
      throw new Error('synthetic-private-detail');
    });
    await expect(
      fetchDesktopSigningBundle({ ...f, token, claims })
    ).rejects.toMatchObject({
      status: 500,
      message: 'Desktop signing bundle unavailable',
    });
    expect(f.rpc).toHaveBeenLastCalledWith(
      'desktop_deployment_complete_bundle',
      { p_lease: 'lease', p_failure_code: 'material_or_admission_failed' }
    );
  });
});

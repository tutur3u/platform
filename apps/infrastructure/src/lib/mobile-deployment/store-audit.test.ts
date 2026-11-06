// @vitest-environment node
import { createHash } from 'node:crypto';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  excludeDraftInheritance: vi.fn(async () => undefined),
  getOrCreateDraftVersion: vi.fn(),
  inheritDraft: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./draft-inheritance', () => ({
  excludeDraftInheritance: mocks.excludeDraftInheritance,
  getOrCreateDraftVersion: mocks.getOrCreateDraftVersion,
  inheritDraft: mocks.inheritDraft,
}));
vi.mock('@/lib/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: mocks.download,
  uploadWorkspaceStorageFileDirect: mocks.upload,
}));
vi.mock('@tuturuuu/auth/api-keys', () => ({
  hashApiKey: async (token: string) =>
    `sha256:${createHash('sha256').update(token).digest('hex')}`,
  validateApiKeyHash: async (token: string, hash: string) =>
    hash === `sha256:${createHash('sha256').update(token).digest('hex')}`,
}));

import { MOBILE_DEPLOYMENT_DRIVE_PREFIX } from './constants';
import { decryptBytes, decryptSecretValue, sha256Hex } from './crypto';
import { isReservedMobileDeploymentDrivePath } from './storage-policy';
import {
  clearMobileDeploymentEnvKey,
  MobileDeploymentStoreError,
  revokeMobileDeploymentCiToken,
  saveMobileDeploymentEnvFile,
  saveMobileDeploymentEnvKey,
  saveMobileDeploymentScalar,
  uploadMobileDeploymentFile,
} from './store';
import {
  SECRET_VALUE,
  serialized,
  setupStoreFixture,
  USER_ID,
} from './store-fixtures.test-support';

const fx = setupStoreFixture(mocks);
const { auditEvents, issueToken, lastAudit } = fx;

describe('mobile deployment store write audit behavior', () => {
  it('encrypts a saved env value and audits only its name', async () => {
    await saveMobileDeploymentEnvKey({
      db: fx.db as never,
      name: 'API_SECRET',
      previousName: 'OLD_SECRET',
      userId: USER_ID,
      value: SECRET_VALUE,
    });

    const [row] = fx.db.tables.mobile_deployment_secret_values;
    expect(row).toMatchObject({
      kind: 'env',
      name: 'API_SECRET',
      version_id: 'v-draft',
    });
    expect(row?.encrypted_value).not.toContain(SECRET_VALUE);
    expect(
      decryptSecretValue(row?.encrypted_value as string, fx.draftKey)
    ).toBe(SECRET_VALUE);

    expect(auditEvents()).toHaveLength(1);
    expect(lastAudit()).toMatchObject({
      actor_type: 'user',
      actor_user_id: USER_ID,
      environment_id: 'env-1',
      event_type: 'env.saved',
      metadata: { name: 'API_SECRET', previousName: 'OLD_SECRET' },
      resource_kind: 'API_SECRET',
      version_id: 'v-draft',
    });
    expect(serialized(auditEvents())).not.toContain(SECRET_VALUE);
    expect(mocks.excludeDraftInheritance).toHaveBeenCalledWith(
      expect.anything(),
      'v-draft',
      'env:OLD_SECRET'
    );
  });

  it('audits an env file replacement by key count and fences inherited env values', async () => {
    await saveMobileDeploymentEnvFile({
      contents: `API_SECRET=${SECRET_VALUE}\nOTHER_SECRET=another-synthetic-value\n`,
      db: fx.db as never,
      userId: USER_ID,
    });

    expect(
      fx.db.tables.mobile_deployment_secret_values.map((row) => row.name).sort()
    ).toEqual(['API_SECRET', 'OTHER_SECRET']);
    expect(mocks.excludeDraftInheritance).toHaveBeenCalledWith(
      expect.anything(),
      'v-draft',
      'env:*'
    );
    expect(lastAudit()).toMatchObject({
      event_type: 'env.replaced',
      metadata: { keyCount: 2 },
      resource_kind: '.env.github',
    });
    expect(serialized(auditEvents())).not.toContain(SECRET_VALUE);
  });

  it('removes a cleared env value, fences inheritance and audits the clear', async () => {
    await saveMobileDeploymentEnvKey({
      db: fx.db as never,
      name: 'API_SECRET',
      userId: USER_ID,
      value: SECRET_VALUE,
    });
    await clearMobileDeploymentEnvKey({
      db: fx.db as never,
      name: 'API_SECRET',
      userId: USER_ID,
    });

    expect(fx.db.tables.mobile_deployment_secret_values).toHaveLength(0);
    expect(mocks.excludeDraftInheritance).toHaveBeenLastCalledWith(
      expect.anything(),
      'v-draft',
      'env:API_SECRET'
    );
    expect(auditEvents().map((event) => event.event_type)).toEqual([
      'env.saved',
      'env.cleared',
    ]);
    expect(lastAudit().metadata).toEqual({ name: 'API_SECRET' });
  });

  it('rejects an invalid scalar before writing a row or an audit event', async () => {
    await expect(
      saveMobileDeploymentScalar({
        db: fx.db as never,
        name: 'GOOGLE_PLAY_TRACK',
        userId: USER_ID,
        value: 'not-a-track',
      })
    ).rejects.toThrow('GOOGLE_PLAY_TRACK');

    expect(fx.db.tables.mobile_deployment_secret_values).toHaveLength(0);
    expect(auditEvents()).toHaveLength(0);
  });

  it('audits an upload by kind and size, stores only ciphertext under the reserved vault prefix', async () => {
    const plaintext = Buffer.from('synthetic-keystore-bytes');
    await uploadMobileDeploymentFile({
      buffer: plaintext,
      contentType: 'application/octet-stream',
      db: fx.db as never,
      filename: 'upload-keystore.jks',
      kind: 'android_upload_keystore',
      userId: USER_ID,
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [workspaceId, path, bytes, options] = mocks.upload.mock.calls[0]!;
    expect(workspaceId).toBe(ROOT_WORKSPACE_ID);
    expect(path).toMatch(
      new RegExp(
        `^${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/v-draft/android_upload_keystore-[0-9a-f]{32}\\.ciphertext\\.json$`
      )
    );
    expect(isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, path)).toBe(
      true
    );
    expect(options).toMatchObject({
      allowReservedMobileDeploymentVault: true,
      contentType: 'application/json',
      upsert: false,
    });
    expect(Buffer.from(bytes).includes(plaintext)).toBe(false);
    expect(
      Buffer.from(decryptBytes(bytes, fx.draftKey)).equals(plaintext)
    ).toBe(true);

    const [artifact] = fx.db.tables.mobile_deployment_file_artifacts;
    expect(artifact).toMatchObject({
      ciphertext_sha256: sha256Hex(bytes),
      plaintext_sha256: sha256Hex(plaintext),
      storage_path: path,
      validation_status: 'valid',
    });
    expect(lastAudit()).toMatchObject({
      event_type: 'file.uploaded',
      metadata: { kind: 'android_upload_keystore', size: plaintext.byteLength },
      resource_kind: 'android_upload_keystore',
    });
    expect(serialized(lastAudit())).not.toContain('upload-keystore.jks');
  });

  it('uploads nothing and audits nothing for an invalid file', async () => {
    await expect(
      uploadMobileDeploymentFile({
        buffer: new Uint8Array(),
        contentType: 'application/json',
        db: fx.db as never,
        filename: 'google-services.json',
        kind: 'android_google_services_json',
        userId: USER_ID,
      })
    ).rejects.toThrow('empty');

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(fx.db.tables.mobile_deployment_file_artifacts).toHaveLength(0);
    expect(auditEvents()).toHaveLength(0);
  });

  it('does not audit a write whose database operation failed', async () => {
    fx.db.failOn(
      'upsert',
      'mobile_deployment_secret_values',
      'synthetic write failure'
    );

    const failure = await saveMobileDeploymentEnvKey({
      db: fx.db as never,
      name: 'API_SECRET',
      userId: USER_ID,
      value: SECRET_VALUE,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MobileDeploymentStoreError);
    expect(failure).toMatchObject({
      status: 500,
      message: 'synthetic write failure',
    });
    expect(auditEvents()).toHaveLength(0);
  });

  it('currently treats audit persistence as best effort, so a lost audit row does not undo the write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fx.db.failOn(
      'insert',
      'mobile_deployment_audit_events',
      'synthetic audit outage'
    );

    await saveMobileDeploymentScalar({
      db: fx.db as never,
      name: 'GOOGLE_PLAY_TRACK',
      userId: USER_ID,
      value: 'beta',
    });

    expect(fx.db.tables.mobile_deployment_secret_values).toHaveLength(1);
    expect(auditEvents()).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      'Failed to record mobile deployment audit event:',
      expect.objectContaining({ message: 'synthetic audit outage' })
    );
  });

  it('records token issue and revoke audits without the token itself', async () => {
    const token = await issueToken(['android']);

    const [row] = fx.db.tables.mobile_deployment_ci_tokens;
    expect(row?.token_hash).toMatch(/^sha256:/);
    expect(serialized(row)).not.toContain(token);
    expect(lastAudit()).toMatchObject({
      actor_type: 'user',
      event_type: 'token.issued',
      token_id: row?.id,
    });
    expect(lastAudit().metadata).toMatchObject({
      platforms: ['android'],
      tokenId: row?.id,
    });
    expect(serialized(auditEvents())).not.toContain(token);

    const state = await revokeMobileDeploymentCiToken({
      db: fx.db as never,
      tokenId: row?.id as string,
      userId: USER_ID,
    });
    expect(lastAudit()).toMatchObject({
      event_type: 'token.revoked',
      token_id: row?.id,
    });
    expect(state.tokens[0]?.revokedAt).toEqual(expect.any(String));
    expect(serialized(state)).not.toContain(token);
  });
});

// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { deleteWorkspaceStorageObjectByPath } from '@tuturuuu/storage-core/workspace-storage-provider';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(async () => ({ provider: 'r2' })),
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

import {
  decryptBytes,
  decryptSecretValue,
  encryptBytes,
  encryptSecretValue,
  sha256Base64Url,
  sha256Hex,
} from './crypto';
import {
  type InheritanceSnapshot,
  prepareInheritance,
} from './draft-inheritance';

function fixture() {
  const sourceKey = randomBytes(32);
  const draftKey = randomBytes(32);
  const content = Buffer.from('test signing artifact');
  const encrypted = encryptBytes(content, sourceKey);
  const snapshot = {
    draft: {
      id: 'draft',
      data_key_ciphertext: 'draft-key',
      inheritance_excluded: [],
    },
    source: { id: 'active', data_key_ciphertext: 'source-key' },
    secrets: [
      {
        kind: 'scalar',
        name: 'ANDROID_KEYSTORE_PASSWORD',
        encrypted_value: encryptSecretValue('fixture-password', sourceKey),
        plaintext_sha256: sha256Base64Url('fixture-password'),
      },
    ],
    files: [
      {
        kind: 'apple_app_store_provisioning_profile',
        storage_provider: 'r2',
        storage_path: 'active/profile',
        ciphertext_sha256: sha256Hex(encrypted),
        plaintext_sha256: sha256Hex(content),
        validation_status: 'valid',
      },
    ],
    draftSecrets: [],
    draftFiles: [],
  } as unknown as InheritanceSnapshot;
  const uploaded: Uint8Array[] = [];
  const dependencies = {
    decryptDataKey: vi.fn(async (name: string) =>
      Buffer.from(name === 'source-key' ? sourceKey : draftKey)
    ),
    download: vi.fn(async () => ({ buffer: encrypted })),
    upload: vi.fn(async (_ws: string, path: string, bytes: Uint8Array) => {
      uploaded.push(bytes);
      return { path, provider: 'r2' as const };
    }),
  };
  return { snapshot, dependencies, sourceKey, draftKey, uploaded, content };
}

describe('vault draft inheritance preparation', () => {
  it('re-encrypts secrets and verified files under the new key without altering the active snapshot', async () => {
    const fixtureData = fixture();
    const { snapshot, dependencies, sourceKey, draftKey, uploaded, content } =
      fixtureData;
    const before = structuredClone(snapshot);
    const result = await prepareInheritance(snapshot, dependencies as never);
    expect(
      decryptSecretValue(result.secrets[0]!.encrypted_value, draftKey)
    ).toBe('fixture-password');
    expect(() =>
      decryptSecretValue(result.secrets[0]!.encrypted_value, sourceKey)
    ).toThrow();
    expect(decryptBytes(uploaded[0]!, draftKey)).toEqual(content);
    expect(result.files[0]?.storage_path).toMatch(
      /^\.tuturuuu\/mobile-deployment-vault\/draft\/inherit-/
    );
    expect(result.files[0]?.ciphertext_sha256).toBe(sha256Hex(uploaded[0]!));
    expect(snapshot).toEqual(before);
  });

  it('retains existing profile overrides and secrets without reading or uploading their active values', async () => {
    const { snapshot, dependencies } = fixture();
    snapshot.draftSecrets = [...snapshot.secrets];
    snapshot.draftFiles = [...snapshot.files];
    expect(await prepareInheritance(snapshot, dependencies as never)).toEqual({
      secrets: [],
      files: [],
    });
    expect(dependencies.download).not.toHaveBeenCalled();
    expect(dependencies.upload).not.toHaveBeenCalled();
  });

  it('preserves explicit deletions and whole-env replacement exclusions', async () => {
    const { snapshot, dependencies } = fixture();
    snapshot.draft.inheritance_excluded = [
      'scalar:ANDROID_KEYSTORE_PASSWORD',
      'env:*',
    ];
    snapshot.secrets.push({
      ...snapshot.secrets[0]!,
      kind: 'env',
      name: 'REMOVED',
    });
    expect(
      (await prepareInheritance(snapshot, dependencies as never)).secrets
    ).toEqual([]);
  });

  it('rejects corrupt encrypted artifacts before uploading anything', async () => {
    const { snapshot, dependencies } = fixture();
    snapshot.files[0]!.ciphertext_sha256 = 'corrupt';
    await expect(
      prepareInheritance(snapshot, dependencies as never)
    ).rejects.toThrow('integrity');
    expect(dependencies.upload).not.toHaveBeenCalled();
  });

  it('leaves draft metadata untouched on partial upload failure and retries to distinct immutable paths', async () => {
    const { snapshot, dependencies } = fixture();
    snapshot.files.push({
      ...snapshot.files[0]!,
      kind: 'android_upload_keystore',
    });
    const before = structuredClone(snapshot);
    dependencies.upload
      .mockImplementationOnce(async (_ws, path, _bytes) => ({
        path,
        provider: 'r2' as const,
      }))
      .mockRejectedValueOnce(new Error('storage unavailable'));
    // One encrypted artifact uploaded before the second fails; no metadata commits.
    await expect(
      prepareInheritance(snapshot, dependencies as never)
    ).rejects.toThrow('storage unavailable');
    expect(deleteWorkspaceStorageObjectByPath).toHaveBeenCalledTimes(2);
    const failedPath = dependencies.upload.mock.calls[0]![1];
    const result = await prepareInheritance(snapshot, dependencies as never);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]!.storage_path).not.toBe(failedPath);
    expect(snapshot).toEqual(before);
  });
});

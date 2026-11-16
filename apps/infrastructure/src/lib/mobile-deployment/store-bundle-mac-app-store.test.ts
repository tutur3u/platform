// @vitest-environment node
import { createHash } from 'node:crypto';
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

import {
  ANDROID_REQUIRED_FILE_KINDS,
  IOS_REQUIRED_FILE_KINDS,
  MAC_APP_STORE_FILE_KINDS,
} from './constants';
import { listMobileDeploymentState } from './store';
import { setupStoreFixture } from './store-fixtures.test-support';

const fx = setupStoreFixture(mocks);
const sortedKinds = (kinds: readonly string[]) => [...kinds].sort();

describe('mobile deployment bundle Mac App Store resources', () => {
  it('keeps the vault ready and the iOS bundle unchanged when they are absent', async () => {
    fx.seedActiveVersion();

    const state = await listMobileDeploymentState(fx.db as never);
    expect(state.activeVersion?.readinessErrors).toEqual([]);

    const bundle = await fx.fetchBundle(await fx.issueToken(['ios']), 'ios');
    expect(sortedKinds(Object.keys(bundle.files))).toEqual(
      sortedKinds(IOS_REQUIRED_FILE_KINDS)
    );
    expect(
      bundle.scalarValues.APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD
    ).toBeUndefined();
  });

  it('carries the complete set in the iOS bundle', async () => {
    fx.seedActiveVersion({
      macFiles: MAC_APP_STORE_FILE_KINDS,
      macPassword: true,
    });

    const bundle = await fx.fetchBundle(await fx.issueToken(['ios']), 'ios');
    expect(sortedKinds(Object.keys(bundle.files))).toEqual(
      sortedKinds([...IOS_REQUIRED_FILE_KINDS, ...MAC_APP_STORE_FILE_KINDS])
    );
    expect(bundle.scalarValues.APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD).toBe(
      'synthetic-installer-password'
    );
    expect(
      bundle.resourceVersionIds.files.apple_mac_app_store_provisioning_profile
    ).toBe('file-apple_mac_app_store_provisioning_profile');
  });

  it('omits an incomplete set, including its password', async () => {
    fx.seedActiveVersion({
      macFiles: ['apple_mac_installer_certificate_p12'],
      macPassword: true,
    });

    const bundle = await fx.fetchBundle(await fx.issueToken(['ios']), 'ios');
    expect(sortedKinds(Object.keys(bundle.files))).toEqual(
      sortedKinds(IOS_REQUIRED_FILE_KINDS)
    );
    expect(
      bundle.scalarValues.APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD
    ).toBeUndefined();
  });

  it('omits an invalid Mac profile from the iOS bundle', async () => {
    fx.seedActiveVersion({
      macFiles: MAC_APP_STORE_FILE_KINDS,
      macPassword: true,
    });
    const profile = fx.db.tables.mobile_deployment_file_artifacts.find(
      (row) => row.kind === 'apple_mac_app_store_provisioning_profile'
    );
    if (profile) profile.validation_status = 'invalid';

    const bundle = await fx.fetchBundle(await fx.issueToken(['ios']), 'ios');
    expect(Object.keys(bundle.files)).not.toContain(
      'apple_mac_app_store_provisioning_profile'
    );
  });

  it('never adds them to the Android bundle', async () => {
    fx.seedActiveVersion({
      macFiles: MAC_APP_STORE_FILE_KINDS,
      macPassword: true,
    });

    const bundle = await fx.fetchBundle(await fx.issueToken(['android']));
    expect(sortedKinds(Object.keys(bundle.files))).toEqual(
      sortedKinds(ANDROID_REQUIRED_FILE_KINDS)
    );
    expect(
      bundle.scalarValues.APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD
    ).toBeUndefined();
  });
});

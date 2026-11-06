import {
  INTERNAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
} from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import { MOBILE_DEPLOYMENT_DRIVE_PREFIX } from './constants';
import {
  buildMobileDeploymentVaultStoragePath,
  filterReservedMobileDeploymentDriveEntries,
  isReservedMobileDeploymentDrivePath,
} from './storage-policy';

// Synthetic identifiers only.
const VERSION_ID = '00000000-0000-4000-8000-000000000001';

describe('mobile deployment reserved storage policy (hardening)', () => {
  it('reserves every path the store itself generates for vault ciphertext', () => {
    const generated = buildMobileDeploymentVaultStoragePath(
      VERSION_ID,
      'android_upload_keystore-0123456789abcdef.ciphertext.json'
    );

    expect(generated).toBe(
      `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/${VERSION_ID}/android_upload_keystore-0123456789abcdef.ciphertext.json`
    );
    expect(
      isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, generated)
    ).toBe(true);
  });

  it('applies the reservation through the internal workspace slug alias', () => {
    expect(
      isReservedMobileDeploymentDrivePath(
        INTERNAL_WORKSPACE_SLUG,
        `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/${VERSION_ID}/file`
      )
    ).toBe(true);
    expect(
      isReservedMobileDeploymentDrivePath(
        INTERNAL_WORKSPACE_SLUG.toUpperCase(),
        `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/${VERSION_ID}/file`
      )
    ).toBe(true);
  });

  it.each([
    // Encoded dots, separators and segment names decode to the reserved prefix.
    '%2Etuturuuu/mobile-deployment-vault/v1/file',
    '.tuturuuu/mobile%2Ddeployment%2Dvault/v1/file',
    '%252Etuturuuu/mobile-deployment-vault/v1/file',
    // An encoded separator inside one segment is never a valid object key.
    '.tuturuuu%2Fmobile-deployment-vault%2Fv1%2Ffile',
    // Traversal and malformed encodings cannot be resolved, so they fail closed.
    'public/../.tuturuuu/mobile-deployment-vault/v1/file',
    'public/%2e%2e/.tuturuuu/mobile-deployment-vault/v1/file',
    'public/%2E%2E%2F.tuturuuu/mobile-deployment-vault',
    '.tuturuuu/mobile-deployment-vault/v1/%zz',
    '.tuturuuu/mobile-deployment-vault/v1/file\u0000.txt',
    '.tuturuuu/mobile-deployment-vault/v1/file\nname',
    // Absolute URLs are not storage keys.
    'https://example.invalid/.tuturuuu/mobile-deployment-vault/v1',
    // Backslash separators normalize to the same prefix.
    '/.tuturuuu\\mobile-deployment-vault\\v1\\file',
  ])('fails closed for evasion attempt %j', (path) => {
    expect(isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, path)).toBe(
      true
    );
  });

  it('keeps ordinary root Drive paths, including the empty root, available', () => {
    for (const path of [
      '',
      'public/readme.md',
      'tuturuuu/mobile-deployment-vault/file',
      '.tuturuuu-public/mobile-deployment-vault/file',
      '.tuturuuu/mobile',
      '.tuturuuu/mobile-deployment-vault-copy/file',
      'folder/.tuturuuu/mobile-deployment-vault/file',
    ]) {
      expect(isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, path)).toBe(
        false
      );
    }
  });

  it('never reserves paths in workspaces other than the root workspace', () => {
    for (const wsId of ['00000000-0000-4000-8000-0000000000aa', 'personal']) {
      expect(
        isReservedMobileDeploymentDrivePath(
          wsId,
          `${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/${VERSION_ID}/file`
        )
      ).toBe(false);
    }
  });

  it('hides the internal folder from root listings for every spelling of the root path', () => {
    const entries = [{ name: '.tuturuuu' }, { name: 'public' }, { name: null }];

    for (const path of ['', '/', '//', '%2e%2e/escape']) {
      expect(
        filterReservedMobileDeploymentDriveEntries(
          ROOT_WORKSPACE_ID,
          path,
          entries
        )
      ).toEqual([{ name: 'public' }, { name: null }]);
    }
    expect(
      filterReservedMobileDeploymentDriveEntries(
        INTERNAL_WORKSPACE_SLUG,
        '',
        entries
      )
    ).toEqual([{ name: 'public' }, { name: null }]);
  });

  it('leaves nested listings and other workspaces untouched', () => {
    const entries = [{ name: '.tuturuuu' }, { name: 'public' }];

    expect(
      filterReservedMobileDeploymentDriveEntries(
        ROOT_WORKSPACE_ID,
        'public',
        entries
      )
    ).toEqual(entries);
    expect(
      filterReservedMobileDeploymentDriveEntries(
        '00000000-0000-4000-8000-0000000000aa',
        '',
        entries
      )
    ).toEqual(entries);
  });
});

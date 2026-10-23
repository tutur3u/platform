import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  filterReservedMobileDeploymentDriveEntries,
  isReservedMobileDeploymentDrivePath,
} from './storage-policy';

describe('mobile deployment storage policy', () => {
  it('blocks normal root Drive access to the reserved vault prefix', () => {
    expect(
      isReservedMobileDeploymentDrivePath(
        ROOT_WORKSPACE_ID,
        '.tuturuuu/mobile-deployment-vault'
      )
    ).toBe(true);
    expect(
      isReservedMobileDeploymentDrivePath(
        ROOT_WORKSPACE_ID,
        '.tuturuuu/mobile-deployment-vault/version/file'
      )
    ).toBe(true);
    expect(
      isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, '.tuturuuu')
    ).toBe(true);
    expect(
      isReservedMobileDeploymentDrivePath(
        ROOT_WORKSPACE_ID,
        '.tuturuuu\\mobile-deployment-vault\\version\\file'
      )
    ).toBe(true);
  });

  it.each([
    '.tuturuuu/mobile-deployment-vault/x%',
    '.tuturuuu/mobile-deployment-vault/',
    '.tuturuuu/mobile-deployment-vault?',
    '.tuturuuu/mobile-deployment-vault#',
    '/.tuturuuu/mobile-deployment-vault/v1',
    '.tuturuuu//mobile-deployment-vault/v1',
  ])('fails closed for malformed reserved vault path %s', (path) => {
    expect(isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, path)).toBe(
      true
    );
  });

  it('does not reserve sibling internal paths in root Drive', () => {
    expect(
      isReservedMobileDeploymentDrivePath(
        ROOT_WORKSPACE_ID,
        '.tuturuuu/other-vault/file'
      )
    ).toBe(false);
    expect(
      isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, 'public/file')
    ).toBe(false);
    expect(
      isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, 'v1..final.pdf')
    ).toBe(false);
    expect(
      isReservedMobileDeploymentDrivePath(ROOT_WORKSPACE_ID, 'docs/')
    ).toBe(false);
  });

  it('does not reserve paths in non-root workspaces', () => {
    expect(
      isReservedMobileDeploymentDrivePath(
        'workspace',
        '.tuturuuu/mobile-deployment-vault/version/file'
      )
    ).toBe(false);
  });

  it('hides the reserved root folder from root Drive listing', () => {
    expect(
      filterReservedMobileDeploymentDriveEntries(ROOT_WORKSPACE_ID, '', [
        { name: '.tuturuuu' },
        { name: 'public' },
      ])
    ).toEqual([{ name: 'public' }]);
  });
});

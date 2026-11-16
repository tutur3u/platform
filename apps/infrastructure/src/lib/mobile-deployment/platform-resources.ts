import {
  ANDROID_REQUIRED_FILE_KINDS,
  ANDROID_REQUIRED_SCALARS,
  IOS_REQUIRED_FILE_KINDS,
  IOS_REQUIRED_SCALARS,
  MAC_APP_STORE_FILE_KINDS,
  MAC_APP_STORE_SCALAR,
  type MobileDeploymentFileKind,
  type MobileDeploymentPlatform,
  type MobileDeploymentScalarName,
} from './constants';
import type { MobileDeploymentFileArtifactRow } from './types';

export function requiredFilesForPlatform(platform: MobileDeploymentPlatform) {
  return platform === 'android'
    ? ANDROID_REQUIRED_FILE_KINDS
    : IOS_REQUIRED_FILE_KINDS;
}

export function requiredScalarsForPlatform(platform: MobileDeploymentPlatform) {
  return platform === 'android'
    ? ANDROID_REQUIRED_SCALARS
    : IOS_REQUIRED_SCALARS;
}

/**
 * Returns the file kinds a platform bundle carries: its required kinds plus the
 * Mac App Store files on iOS when the whole optional set is present and valid.
 * The consumer treats a partial set as a hard failure, so an incomplete set is
 * left out entirely and its installer password is removed from `scalarValues`.
 */
export function bundleFileKindsForPlatform(
  platform: MobileDeploymentPlatform,
  filesByKind: ReadonlyMap<string, MobileDeploymentFileArtifactRow>,
  scalarValues: Partial<Record<MobileDeploymentScalarName, string>>
): readonly MobileDeploymentFileKind[] {
  const required = requiredFilesForPlatform(platform);
  const macComplete =
    platform === 'ios' &&
    Boolean(scalarValues[MAC_APP_STORE_SCALAR]) &&
    MAC_APP_STORE_FILE_KINDS.every(
      (kind) => filesByKind.get(kind)?.validation_status === 'valid'
    );

  if (!macComplete) {
    delete scalarValues[MAC_APP_STORE_SCALAR];
    return required;
  }

  return [...required, ...MAC_APP_STORE_FILE_KINDS];
}

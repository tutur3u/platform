import { PLATFORM_BUILD_METADATA } from './generated/platform-build-metadata';

export const TUTURUUU_PLATFORM_VERSION = '0.1.0';

export type PlatformBuildMetadataInput = {
  builtAt?: string | null;
  commitHash?: string | null;
  commitMessage?: string | null;
  deploymentStamp?: string | null;
  deploymentUrl?: string | null;
  environment?: string | null;
  refName?: string | null;
  shortCommitHash?: string | null;
};

export type PlatformBuildMetadata = {
  builtAt: string;
  commitHash: string;
  commitMessage: string;
  deploymentStamp: string | null;
  deploymentUrl: string | null;
  environment: string;
  refName: string;
  shortCommitHash: string;
};

export type PlatformReleaseInfo = PlatformBuildMetadata & {
  appName: string;
  version: string;
};

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: string | null | undefined) {
  return cleanString(value);
}

export function normalizePlatformBuildMetadata(
  input: PlatformBuildMetadataInput
): PlatformBuildMetadata {
  const commitHash = cleanString(input.commitHash) ?? 'local';
  const shortCommitHash =
    cleanString(input.shortCommitHash) ??
    (commitHash === 'local' ? 'local' : commitHash.slice(0, 7));

  return {
    builtAt: cleanString(input.builtAt) ?? 'local',
    commitHash,
    commitMessage: cleanString(input.commitMessage) ?? 'Unknown',
    deploymentStamp: normalizeOptionalString(input.deploymentStamp),
    deploymentUrl: normalizeOptionalString(input.deploymentUrl),
    environment: cleanString(input.environment) ?? 'local',
    refName: cleanString(input.refName) ?? 'local',
    shortCommitHash,
  };
}

export const TUTURUUU_PLATFORM_BUILD_METADATA = normalizePlatformBuildMetadata(
  PLATFORM_BUILD_METADATA
);

export function getPlatformReleaseInfo(appName: string): PlatformReleaseInfo {
  return {
    ...TUTURUUU_PLATFORM_BUILD_METADATA,
    appName,
    version: TUTURUUU_PLATFORM_VERSION,
  };
}

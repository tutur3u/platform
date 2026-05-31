import { PLATFORM_BUILD_METADATA } from './generated/platform-build-metadata';

export const TUTURUUU_PLATFORM_VERSION = '0.1.88';

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

export type PlatformBuildRuntimeEnv = Partial<
  Record<
    | 'PLATFORM_BUILD_BUILT_AT'
    | 'PLATFORM_BUILD_COMMIT_HASH'
    | 'PLATFORM_BUILD_COMMIT_MESSAGE'
    | 'PLATFORM_BUILD_COMMIT_SHORT_HASH'
    | 'PLATFORM_BUILD_DEPLOYMENT_STAMP'
    | 'PLATFORM_BUILD_DEPLOYMENT_URL'
    | 'PLATFORM_BUILD_ENVIRONMENT'
    | 'PLATFORM_BUILD_REF_NAME',
    string | null | undefined
  >
>;

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: string | null | undefined) {
  return cleanString(value);
}

function normalizeUrl(value: string | null | undefined) {
  const url = cleanString(value);

  if (!url) {
    return null;
  }

  return /^https?:\/\//iu.test(url) ? url : `https://${url}`;
}

function readRuntimePlatformBuildMetadata(
  env: PlatformBuildRuntimeEnv
): PlatformBuildMetadataInput {
  return {
    builtAt: cleanString(env.PLATFORM_BUILD_BUILT_AT),
    commitHash: cleanString(env.PLATFORM_BUILD_COMMIT_HASH),
    commitMessage: cleanString(env.PLATFORM_BUILD_COMMIT_MESSAGE),
    deploymentStamp: cleanString(env.PLATFORM_BUILD_DEPLOYMENT_STAMP),
    deploymentUrl: normalizeUrl(env.PLATFORM_BUILD_DEPLOYMENT_URL),
    environment: cleanString(env.PLATFORM_BUILD_ENVIRONMENT),
    refName: cleanString(env.PLATFORM_BUILD_REF_NAME),
    shortCommitHash: cleanString(env.PLATFORM_BUILD_COMMIT_SHORT_HASH),
  };
}

function getRuntimeEnv(): PlatformBuildRuntimeEnv {
  if (typeof process === 'undefined') {
    return {};
  }

  return {
    PLATFORM_BUILD_BUILT_AT: process.env.PLATFORM_BUILD_BUILT_AT,
    PLATFORM_BUILD_COMMIT_HASH: process.env.PLATFORM_BUILD_COMMIT_HASH,
    PLATFORM_BUILD_COMMIT_MESSAGE: process.env.PLATFORM_BUILD_COMMIT_MESSAGE,
    PLATFORM_BUILD_COMMIT_SHORT_HASH:
      process.env.PLATFORM_BUILD_COMMIT_SHORT_HASH,
    PLATFORM_BUILD_DEPLOYMENT_STAMP:
      process.env.PLATFORM_BUILD_DEPLOYMENT_STAMP,
    PLATFORM_BUILD_DEPLOYMENT_URL: process.env.PLATFORM_BUILD_DEPLOYMENT_URL,
    PLATFORM_BUILD_ENVIRONMENT: process.env.PLATFORM_BUILD_ENVIRONMENT,
    PLATFORM_BUILD_REF_NAME: process.env.PLATFORM_BUILD_REF_NAME,
  };
}

function mergePlatformBuildMetadata(
  generated: PlatformBuildMetadataInput,
  runtime: PlatformBuildMetadataInput
): PlatformBuildMetadataInput {
  return {
    builtAt: runtime.builtAt ?? generated.builtAt,
    commitHash: runtime.commitHash ?? generated.commitHash,
    commitMessage: runtime.commitMessage ?? generated.commitMessage,
    deploymentStamp: runtime.deploymentStamp ?? generated.deploymentStamp,
    deploymentUrl: runtime.deploymentUrl ?? generated.deploymentUrl,
    environment: runtime.environment ?? generated.environment,
    refName: runtime.refName ?? generated.refName,
    shortCommitHash: runtime.shortCommitHash ?? generated.shortCommitHash,
  };
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
    deploymentUrl: normalizeUrl(input.deploymentUrl),
    environment: cleanString(input.environment) ?? 'local',
    refName: cleanString(input.refName) ?? 'local',
    shortCommitHash,
  };
}

export const TUTURUUU_PLATFORM_BUILD_METADATA = normalizePlatformBuildMetadata(
  PLATFORM_BUILD_METADATA
);

export function getPlatformReleaseInfo(
  appName: string,
  env: PlatformBuildRuntimeEnv = getRuntimeEnv()
): PlatformReleaseInfo {
  const metadata = normalizePlatformBuildMetadata(
    mergePlatformBuildMetadata(
      PLATFORM_BUILD_METADATA,
      readRuntimePlatformBuildMetadata(env)
    )
  );

  return {
    ...metadata,
    appName,
    version: TUTURUUU_PLATFORM_VERSION,
  };
}

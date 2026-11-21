import { PLATFORM_BUILD_METADATA } from './generated/platform-build-metadata';

export const TUTURUUU_PLATFORM_VERSION = '0.73.0'; // x-release-please-version

export type PlatformBuildMetadataInput = {
  /** ISO build time: the source commit time for reproducible (CI) builds, the start time for local builds and dev servers. */
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
  /** ISO build time: the source commit time for reproducible (CI) builds, the start time for local builds and dev servers. */
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

export type PlatformLocalBuildEnv = Partial<
  Record<
    | 'PLATFORM_LOCAL_BUILD_BUILT_AT'
    | 'PLATFORM_LOCAL_BUILD_COMMIT_HASH'
    | 'PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE'
    | 'PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH'
    | 'PLATFORM_LOCAL_BUILD_REF_NAME',
    string | null | undefined
  >
>;

/**
 * The stamp `platform-build-env` inlines into local builds and dev servers.
 * Each key is read statically so Vite `define` and Next `env` can replace it.
 */
function getLocalBuildEnv(): PlatformLocalBuildEnv {
  // Unguarded on purpose: in a browser bundle each reference below is a
  // literal Vite inlined, and an unreplaced one throws and reads as unset.
  return {
    PLATFORM_LOCAL_BUILD_BUILT_AT: readInlinedEnv(
      () => process.env.PLATFORM_LOCAL_BUILD_BUILT_AT
    ),
    PLATFORM_LOCAL_BUILD_COMMIT_HASH: readInlinedEnv(
      () => process.env.PLATFORM_LOCAL_BUILD_COMMIT_HASH
    ),
    PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE: readInlinedEnv(
      () => process.env.PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE
    ),
    PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH: readInlinedEnv(
      () => process.env.PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH
    ),
    PLATFORM_LOCAL_BUILD_REF_NAME: readInlinedEnv(
      () => process.env.PLATFORM_LOCAL_BUILD_REF_NAME
    ),
  };
}

/** Reads a bundler-inlined env value; a missing `process` reads as unset. */
export function readInlinedEnv(
  read: () => string | undefined
): string | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** Generated placeholders mean "no reproducible metadata"; a local stamp fills them. */
function generatedValue(value: string | null | undefined) {
  const cleaned = cleanString(value);
  return cleaned === 'local' || cleaned === 'Unknown' ? null : cleaned;
}

function readLocalPlatformBuildMetadata(
  generated: PlatformBuildMetadataInput,
  local: PlatformLocalBuildEnv
): PlatformBuildMetadataInput {
  const localHash = cleanString(local.PLATFORM_LOCAL_BUILD_COMMIT_HASH);
  const useLocalCommit = !generatedValue(generated.commitHash) && localHash;

  return {
    ...generated,
    builtAt:
      generatedValue(generated.builtAt) ??
      cleanString(local.PLATFORM_LOCAL_BUILD_BUILT_AT),
    // Commit fields move together, so a hash never pairs with another
    // commit's message.
    commitHash: useLocalCommit ? localHash : generated.commitHash,
    commitMessage: useLocalCommit
      ? cleanString(local.PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE)
      : generated.commitMessage,
    shortCommitHash: useLocalCommit
      ? cleanString(local.PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH)
      : generated.shortCommitHash,
    refName:
      generatedValue(generated.refName) ??
      cleanString(local.PLATFORM_LOCAL_BUILD_REF_NAME) ??
      generated.refName,
  };
}

function mergePlatformBuildMetadata(
  generated: PlatformBuildMetadataInput,
  runtime: PlatformBuildMetadataInput
): PlatformBuildMetadataInput {
  const runtimeHash = cleanString(runtime.commitHash);
  // Commit fields move together: a runtime hash keeps another source's message
  // or short hash only when that source describes the same commit.
  const sameCommit =
    !runtimeHash || runtimeHash === cleanString(generated.commitHash);

  return {
    builtAt: runtime.builtAt ?? generated.builtAt,
    commitHash: runtimeHash ?? generated.commitHash,
    commitMessage:
      runtime.commitMessage ?? (sameCommit ? generated.commitMessage : null),
    deploymentStamp: runtime.deploymentStamp ?? generated.deploymentStamp,
    deploymentUrl: runtime.deploymentUrl ?? generated.deploymentUrl,
    environment: runtime.environment ?? generated.environment,
    refName: runtime.refName ?? generated.refName,
    shortCommitHash:
      runtime.shortCommitHash ??
      (sameCommit ? generated.shortCommitHash : null),
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

/**
 * Precedence per field: runtime `PLATFORM_BUILD_*` variables, then the
 * generated (CI) metadata, then the local build stamp, then placeholders.
 */
export function getPlatformReleaseInfo(
  appName: string,
  env: PlatformBuildRuntimeEnv = getRuntimeEnv(),
  local: PlatformLocalBuildEnv = getLocalBuildEnv(),
  generated: PlatformBuildMetadataInput = PLATFORM_BUILD_METADATA
): PlatformReleaseInfo {
  const metadata = normalizePlatformBuildMetadata(
    mergePlatformBuildMetadata(
      readLocalPlatformBuildMetadata(generated, local),
      readRuntimePlatformBuildMetadata(env)
    )
  );

  return {
    ...metadata,
    appName,
    version: TUTURUUU_PLATFORM_VERSION,
  };
}

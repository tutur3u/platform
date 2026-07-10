import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import {
  getPlatformReleaseInfo,
  type PlatformBuildMetadataInput,
  type PlatformBuildRuntimeEnv,
  type PlatformReleaseInfo,
} from '@tuturuuu/utils/platform-release';

type FsLike = Pick<typeof fs, 'existsSync' | 'readFileSync'>;

type RuntimeCandidate = PlatformBuildMetadataInput & {
  activeColor?: string | null;
  deploymentOrderAt?: string | null;
  runtimeState?: string | null;
  status?: string | null;
};

type WebPlatformReleaseRuntimeEnv = PlatformBuildRuntimeEnv &
  Partial<Record<string, string | null | undefined>> & {
    PLATFORM_BLUE_GREEN_MONITORING_DIR?: string | null | undefined;
  };

type WebPlatformReleaseInfoOptions = {
  cwd?: string;
  env?: WebPlatformReleaseRuntimeEnv;
  fsImpl?: FsLike;
  monitoringDir?: string | null;
};

const MONITORING_DIR_ENV = 'PLATFORM_BLUE_GREEN_MONITORING_DIR';

function getProcessRuntimeEnv(): WebPlatformReleaseRuntimeEnv {
  if (typeof process === 'undefined') {
    return {};
  }

  return {
    PLATFORM_BLUE_GREEN_MONITORING_DIR:
      process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR,
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
    PLATFORM_DEPLOYMENT_STAMP: process.env.PLATFORM_DEPLOYMENT_STAMP,
  };
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeUrl(value: unknown) {
  const url = cleanString(value);

  if (!url) {
    return null;
  }

  return /^https?:\/\//iu.test(url) ? url : `https://${url}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toIsoTimestamp(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parsed = Date.parse(trimmed);

    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return null;
}

function readJsonFile<T>(filePath: string, fsImpl: FsLike) {
  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string, fsImpl: FsLike) {
  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    return cleanString(fsImpl.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveMonitoringDir({
  cwd = process.cwd(),
  env = getProcessRuntimeEnv(),
  fsImpl = fs,
  monitoringDir,
}: WebPlatformReleaseInfoOptions) {
  const configuredDir =
    monitoringDir ?? cleanString(env[MONITORING_DIR_ENV] ?? null);
  const candidates = [
    configuredDir,
    path.resolve(cwd, 'tmp', 'docker-web'),
    path.resolve(cwd, '..', 'tmp', 'docker-web'),
    path.resolve(cwd, '..', '..', 'tmp', 'docker-web'),
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => fsImpl.existsSync(candidate)) ?? null;
}

function readExplicitRuntimeMetadata(
  env: WebPlatformReleaseInfoOptions['env'] = getProcessRuntimeEnv()
): PlatformBuildMetadataInput {
  return {
    builtAt: cleanString(env.PLATFORM_BUILD_BUILT_AT),
    commitHash: cleanString(env.PLATFORM_BUILD_COMMIT_HASH),
    commitMessage: cleanString(env.PLATFORM_BUILD_COMMIT_MESSAGE),
    deploymentStamp:
      cleanString(env.PLATFORM_BUILD_DEPLOYMENT_STAMP) ??
      cleanString(env.PLATFORM_DEPLOYMENT_STAMP),
    deploymentUrl: normalizeUrl(env.PLATFORM_BUILD_DEPLOYMENT_URL),
    environment: cleanString(env.PLATFORM_BUILD_ENVIRONMENT),
    refName: cleanString(env.PLATFORM_BUILD_REF_NAME),
    shortCommitHash: cleanString(env.PLATFORM_BUILD_COMMIT_SHORT_HASH),
  };
}

function normalizeDeploymentCandidate(value: unknown): RuntimeCandidate | null {
  const record = toRecord(value);

  if (!record) {
    return null;
  }

  const commitHash = cleanString(record.commitHash);
  const shortCommitHash =
    cleanString(record.commitShortHash) ?? cleanString(record.shortCommitHash);
  const commitMessage =
    cleanString(record.commitMessage) ?? cleanString(record.commitSubject);
  const builtAt =
    toIsoTimestamp(record.committedAt) ??
    toIsoTimestamp(record.sourceTimestamp) ??
    toIsoTimestamp(record.builtAt);
  const deploymentOrderAt =
    toIsoTimestamp(record.activatedAt) ??
    toIsoTimestamp(record.finishedAt) ??
    toIsoTimestamp(record.lastPromotedAt) ??
    toIsoTimestamp(record.startedAt) ??
    toIsoTimestamp(record.updatedAt);
  const deploymentStamp = cleanString(record.deploymentStamp);

  if (
    !commitHash &&
    !shortCommitHash &&
    !commitMessage &&
    !builtAt &&
    !deploymentStamp
  ) {
    return null;
  }

  return {
    activeColor: cleanString(record.activeColor),
    builtAt,
    commitHash,
    commitMessage,
    deploymentOrderAt,
    deploymentStamp,
    deploymentUrl: normalizeUrl(record.deploymentUrl),
    environment: cleanString(record.environment),
    refName: cleanString(record.refName),
    runtimeState: cleanString(record.runtimeState),
    shortCommitHash,
    status: cleanString(record.status),
  };
}

function normalizeTargetCandidate(value: unknown): RuntimeCandidate | null {
  const record = toRecord(value);

  if (!record) {
    return null;
  }

  return normalizeDeploymentCandidate({
    ...record,
    activatedAt: record.lastPromotedAt,
  });
}

function getCandidateTimestamp(candidate: RuntimeCandidate) {
  const timestamp = candidate.deploymentOrderAt ?? candidate.builtAt;

  return timestamp ? Date.parse(timestamp) : 0;
}

function pickLatestCandidate(candidates: RuntimeCandidate[]) {
  return candidates
    .filter((candidate) => candidate.status === 'successful')
    .sort(
      (left, right) =>
        getCandidateTimestamp(right) - getCandidateTimestamp(left)
    )[0];
}

function mergeCandidateMetadata(
  candidates: Array<RuntimeCandidate | null | undefined>
): PlatformBuildMetadataInput {
  const metadata: PlatformBuildMetadataInput = {};

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    metadata.builtAt ??= candidate.builtAt;
    metadata.commitHash ??= candidate.commitHash;
    metadata.commitMessage ??= candidate.commitMessage;
    metadata.deploymentStamp ??= candidate.deploymentStamp;
    metadata.deploymentUrl ??= candidate.deploymentUrl;
    metadata.environment ??= candidate.environment;
    metadata.refName ??= candidate.refName;
    metadata.shortCommitHash ??= candidate.shortCommitHash;
  }

  return metadata;
}

function readBlueGreenRuntimeMetadata(
  options: WebPlatformReleaseInfoOptions = {}
): PlatformBuildMetadataInput {
  const fsImpl = options.fsImpl ?? fs;
  const monitoringDir = resolveMonitoringDir({ ...options, fsImpl });

  if (!monitoringDir) {
    return {};
  }

  const prodDir = path.join(monitoringDir, 'prod');
  const watchDir = path.join(monitoringDir, 'watch');
  const activeColor = readTextFile(path.join(prodDir, 'active-color'), fsImpl);
  const deploymentStamp = readTextFile(
    path.join(prodDir, 'deployment-stamp'),
    fsImpl
  );
  const targetState = readJsonFile<Record<string, unknown>>(
    path.join(prodDir, 'target-state.json'),
    fsImpl
  );
  const status = readJsonFile<Record<string, unknown>>(
    path.join(watchDir, 'blue-green-auto-deploy.status.json'),
    fsImpl
  );
  const history =
    readJsonFile<Array<Record<string, unknown>>>(
      path.join(watchDir, 'blue-green-auto-deploy.history.json'),
      fsImpl
    ) ?? [];
  const statusDeployments = Array.isArray(status?.deployments)
    ? (status.deployments as unknown[])
    : [];
  const deployments = [...statusDeployments, ...history]
    .map(normalizeDeploymentCandidate)
    .filter((candidate): candidate is RuntimeCandidate => Boolean(candidate));
  const targetCandidate = normalizeTargetCandidate(
    toRecord(toRecord(targetState)?.targets)?.web
  );
  const activeDeployment =
    deployments.find((candidate) => candidate.runtimeState === 'active') ??
    null;
  const latestSuccessfulForActiveColor =
    activeColor == null
      ? null
      : pickLatestCandidate(
          deployments.filter(
            (candidate) => candidate.activeColor === activeColor
          )
        );
  const latestSuccessful = pickLatestCandidate(deployments);
  const runtimeMetadata = mergeCandidateMetadata([
    targetCandidate?.activeColor === activeColor ? targetCandidate : null,
    activeDeployment,
    latestSuccessfulForActiveColor,
    latestSuccessful,
    targetCandidate,
  ]);

  return {
    ...runtimeMetadata,
    deploymentStamp: deploymentStamp ?? runtimeMetadata.deploymentStamp,
  };
}

function fillReleaseMetadata(
  base: PlatformReleaseInfo,
  explicit: PlatformBuildMetadataInput,
  runtime: PlatformBuildMetadataInput
): PlatformReleaseInfo {
  return {
    ...base,
    builtAt: explicit.builtAt ?? runtime.builtAt ?? base.builtAt,
    commitHash: explicit.commitHash ?? runtime.commitHash ?? base.commitHash,
    commitMessage:
      explicit.commitMessage ?? runtime.commitMessage ?? base.commitMessage,
    deploymentStamp:
      explicit.deploymentStamp ??
      runtime.deploymentStamp ??
      base.deploymentStamp,
    deploymentUrl:
      explicit.deploymentUrl ?? runtime.deploymentUrl ?? base.deploymentUrl,
    environment:
      explicit.environment ?? runtime.environment ?? base.environment,
    refName: explicit.refName ?? runtime.refName ?? base.refName,
    shortCommitHash:
      explicit.shortCommitHash ??
      runtime.shortCommitHash ??
      base.shortCommitHash,
  };
}

export function getWebPlatformReleaseInfo(
  appName: string,
  options: WebPlatformReleaseInfoOptions = {}
): PlatformReleaseInfo {
  const env = options.env ?? getProcessRuntimeEnv();
  const base = getPlatformReleaseInfo(appName, env);
  const explicit = readExplicitRuntimeMetadata(env);
  const runtime = readBlueGreenRuntimeMetadata({ ...options, env });

  return fillReleaseMetadata(base, explicit, runtime);
}

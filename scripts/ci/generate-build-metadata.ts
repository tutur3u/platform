import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type Metadata = {
  builtAt: string;
  commitHash: string;
  commitMessage: string;
  deploymentStamp: string | null;
  deploymentUrl: string | null;
  environment: string;
  refName: string;
};

type MetadataOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  git?: (args: string[]) => string | null;
};

function readGit(cwd: string, args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function firstValue(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  const timestamp = firstValue(value);

  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function timestampFromSourceDateEpoch(
  value: string | null | undefined
): string | null {
  const epochValue = firstValue(value);

  if (!epochValue) {
    return null;
  }

  const epoch = Number(epochValue);

  if (!Number.isFinite(epoch) || epoch < 0) {
    return null;
  }

  return new Date(epoch * 1000).toISOString();
}

function normalizeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//iu.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function resolveBuildMetadata({
  cwd = process.cwd(),
  env = process.env,
  git,
}: MetadataOptions = {}): Metadata {
  const read = git ?? ((args: string[]) => readGit(cwd, args));
  const headTimestamp = normalizeTimestamp(
    read(['show', '-s', '--format=%cI', 'HEAD'])
  );

  return {
    builtAt:
      headTimestamp ??
      normalizeTimestamp(env.PLATFORM_BUILD_BUILT_AT) ??
      timestampFromSourceDateEpoch(env.SOURCE_DATE_EPOCH) ??
      'local',
    commitHash:
      firstValue(
        read(['rev-parse', 'HEAD']),
        env.PLATFORM_BUILD_COMMIT_HASH,
        env.GITHUB_SHA,
        env.VERCEL_GIT_COMMIT_SHA
      ) ?? 'local',
    commitMessage:
      firstValue(
        read(['log', '-1', '--pretty=%s']),
        env.PLATFORM_BUILD_COMMIT_MESSAGE,
        env.VERCEL_GIT_COMMIT_MESSAGE
      ) ?? 'Unknown',
    deploymentStamp: firstValue(
      env.PLATFORM_BUILD_DEPLOYMENT_STAMP,
      env.PLATFORM_DEPLOYMENT_STAMP
    ),
    deploymentUrl: normalizeUrl(
      firstValue(
        env.PLATFORM_BUILD_DEPLOYMENT_URL,
        env.VERCEL_URL,
        env.NEXT_PUBLIC_APP_URL,
        env.WEB_APP_URL
      )
    ),
    environment:
      firstValue(
        env.PLATFORM_BUILD_ENVIRONMENT,
        env.VERCEL_ENV,
        env.GITHUB_REF_NAME === 'production' ? 'production' : null,
        env.NODE_ENV
      ) ?? 'local',
    refName:
      firstValue(
        env.PLATFORM_BUILD_REF_NAME,
        env.GITHUB_REF_NAME,
        env.VERCEL_GIT_COMMIT_REF,
        read(['branch', '--show-current'])
      ) ?? 'local',
  };
}

export function serializeBuildMetadata(metadata: Metadata): string {
  return `import type { PlatformBuildMetadataInput } from '../platform-release';\n\nexport const PLATFORM_BUILD_METADATA: PlatformBuildMetadataInput = ${JSON.stringify(
    metadata,
    null,
    2
  )};\n`;
}

export function generateBuildMetadata(options: MetadataOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const outputPath = resolve(
    cwd,
    'packages/utils/src/generated/platform-build-metadata.ts'
  );
  const output = serializeBuildMetadata(
    resolveBuildMetadata({ ...options, cwd })
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');

  return outputPath;
}

if (import.meta.main) {
  generateBuildMetadata();
}

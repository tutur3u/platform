import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Metadata = {
  builtAt: string;
  commitHash: string;
  commitMessage: string;
  deploymentStamp: string | null;
  deploymentUrl: string | null;
  environment: string;
  refName: string;
};

const outputPath = resolve(
  process.cwd(),
  'packages/utils/src/generated/platform-build-metadata.ts'
);

function git(args: string[]) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function firstValue(...values: (string | null | undefined)[]) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function normalizeUrl(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//iu.test(value)) {
    return value;
  }

  return `https://${value}`;
}

const metadata: Metadata = {
  builtAt: new Date().toISOString(),
  commitHash:
    firstValue(
      process.env.GITHUB_SHA,
      process.env.VERCEL_GIT_COMMIT_SHA,
      git(['rev-parse', 'HEAD'])
    ) ?? 'local',
  commitMessage:
    firstValue(
      process.env.VERCEL_GIT_COMMIT_MESSAGE,
      git(['log', '-1', '--pretty=%s'])
    ) ?? 'Unknown',
  deploymentStamp: firstValue(process.env.PLATFORM_DEPLOYMENT_STAMP),
  deploymentUrl: normalizeUrl(
    firstValue(
      process.env.VERCEL_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.WEB_APP_URL
    )
  ),
  environment:
    firstValue(
      process.env.VERCEL_ENV,
      process.env.GITHUB_REF_NAME === 'production' ? 'production' : null,
      process.env.NODE_ENV
    ) ?? 'local',
  refName:
    firstValue(
      process.env.GITHUB_REF_NAME,
      process.env.VERCEL_GIT_COMMIT_REF,
      git(['branch', '--show-current'])
    ) ?? 'local',
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `import type { PlatformBuildMetadataInput } from '../platform-release';\n\nexport const PLATFORM_BUILD_METADATA: PlatformBuildMetadataInput = ${JSON.stringify(
    metadata,
    null,
    2
  )};\n`,
  'utf8'
);

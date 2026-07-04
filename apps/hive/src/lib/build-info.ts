import 'server-only';

import { execFileSync } from 'node:child_process';
import type { HiveBuildInfo } from '@tuturuuu/hive-ui/studio';
import packageJson from '../../package.json';

let cachedBuildInfo: HiveBuildInfo | null = null;

export function getHiveBuildInfo(): HiveBuildInfo {
  const commitHash =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.COMMIT_SHA ??
    readGit(['rev-parse', 'HEAD']);

  cachedBuildInfo ??= {
    commitHash,
    commitMessage:
      process.env.VERCEL_GIT_COMMIT_MESSAGE ??
      process.env.GIT_COMMIT_MESSAGE ??
      readGit(['log', '-1', '--pretty=%B']),
    version: packageJson.version,
  };

  return cachedBuildInfo;
}

function readGit(args: string[]) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  try {
    return execFileSync('git', args, {
      cwd: /*turbopackIgnore: true*/ process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

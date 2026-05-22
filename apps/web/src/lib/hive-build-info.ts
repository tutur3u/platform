import 'server-only';

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import type { HiveBuildInfo } from '@tuturuuu/hive-ui/studio';
import packageJson from '../../package.json';

let cachedBuildInfo: HiveBuildInfo | null = null;

export function getHiveBuildInfo(): HiveBuildInfo {
  const commitHash =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.COMMIT_SHA ??
    readGit(['rev-parse', 'HEAD']) ??
    readLocalGitHead();

  cachedBuildInfo ??= {
    commitHash,
    commitMessage:
      process.env.VERCEL_GIT_COMMIT_MESSAGE ??
      process.env.GIT_COMMIT_MESSAGE ??
      readGit(['log', '-1', '--pretty=%B']) ??
      readLocalGitCommitMessage(commitHash),
    version: packageJson.version,
  };

  return cachedBuildInfo;
}

function readGit(args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function findGitDir(start: string) {
  let current = start;

  while (true) {
    const candidate = join(current, '.git');

    if (existsSync(candidate)) {
      try {
        const statTarget = readFileSync(candidate, 'utf8');
        if (statTarget.startsWith('gitdir:')) {
          const gitDir = statTarget.slice('gitdir:'.length).trim();
          return isAbsolute(gitDir) ? gitDir : resolve(current, gitDir);
        }
      } catch {
        return candidate;
      }

      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readLocalGitHead() {
  const gitDir = findGitDir(process.cwd());
  if (!gitDir) return null;

  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head || null;

    const ref = head.slice('ref:'.length).trim();
    const refPath = join(gitDir, ref);

    if (existsSync(refPath)) {
      return readFileSync(refPath, 'utf8').trim() || null;
    }

    const packedRefs = join(gitDir, 'packed-refs');
    if (!existsSync(packedRefs)) return null;

    for (const line of readFileSync(packedRefs, 'utf8').split('\n')) {
      if (line.startsWith('#') || line.startsWith('^')) continue;
      const [hash, packedRef] = line.trim().split(/\s+/u);
      if (packedRef === ref) return hash ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function readLocalGitCommitMessage(commitHash: string | null) {
  if (!commitHash || commitHash.length < 3) return null;

  const gitDir = findGitDir(process.cwd());
  if (!gitDir) return null;

  try {
    const objectPath = join(
      gitDir,
      'objects',
      commitHash.slice(0, 2),
      commitHash.slice(2)
    );
    const inflated = inflateSync(readFileSync(objectPath)).toString('utf8');
    const messageStart = inflated.indexOf('\n\n');

    return messageStart === -1 ? null : inflated.slice(messageStart + 2).trim();
  } catch {
    return null;
  }
}

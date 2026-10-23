import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

// Typed envelope for running an exact pushed commit on a trusted runner.
// The client never sends shell text: only a SHA, a relative directory and an
// argv, each validated here before any git or process work starts.
export const COMMIT_RUN_ENVELOPE = '__ttr_commit_run_v1__';

export interface CommitRunSpec {
  sha: string;
  prefix: string;
  command: string[];
}

export function encodeCommitRun(spec: CommitRunSpec) {
  validateCommitRun(spec);
  return [
    COMMIT_RUN_ENVELOPE,
    Buffer.from(JSON.stringify({ v: 1, ...spec })).toString('base64url'),
  ];
}

function validateCommitRun(spec: CommitRunSpec) {
  if (!/^[0-9a-f]{40}$/u.test(spec.sha))
    throw new Error('Commit run requires a full 40-character commit SHA.');
  const prefix = spec.prefix.replace(/\/+$/u, '');
  if (
    prefix.length > 512 ||
    prefix.startsWith('/') ||
    prefix.includes('\\') ||
    (prefix && posix.normalize(prefix) !== prefix) ||
    prefix.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('Commit run directory must be a clean relative path.');
  if (
    !Array.isArray(spec.command) ||
    spec.command.length < 1 ||
    spec.command.length > 256 ||
    spec.command.some((part) => typeof part !== 'string' || part.length > 8192)
  )
    throw new Error('Commit run requires a bounded argv command.');
  if (!spec.command[0] || spec.command[0].startsWith('__ttr_'))
    throw new Error('Commit runs cannot wrap other devbox envelopes.');
  return { ...spec, prefix };
}

export function decodeCommitRun(command: string[]): CommitRunSpec {
  if (command[0] !== COMMIT_RUN_ENVELOPE || command.length !== 2)
    throw new Error('Invalid commit run envelope.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(command[1]!, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid commit run envelope.');
  }
  const value = parsed as Partial<CommitRunSpec> & { v?: unknown };
  if (value?.v !== 1 || typeof value.prefix !== 'string')
    throw new Error('Invalid commit run envelope.');
  return validateCommitRun({
    sha: String(value.sha ?? ''),
    prefix: value.prefix,
    command: value.command as string[],
  });
}

type Git = (args: string[], cwd: string) => Promise<void>;
const realGit: Git = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
      (error) => (error ? reject(error) : resolve())
    );
  });

// Fetches the exact SHA into the runner's checkout objects and creates a
// throwaway detached worktree. Errors stay generic because git stderr can
// include remote URLs, which may embed credentials.
export async function prepareCommitWorktree({
  checkout,
  sha,
  runId,
  git = realGit,
}: {
  checkout: string;
  sha: string;
  runId: string;
  git?: Git;
}) {
  const path = join(
    tmpdir(),
    `ttr-commit-run-${runId.replace(/[^a-zA-Z0-9-]/gu, '').slice(0, 64)}`
  );
  const cleanup = async () => {
    await git(['worktree', 'remove', '--force', path], checkout).catch(
      () => {}
    );
    await rm(path, { force: true, recursive: true }).catch(() => {});
    await git(['worktree', 'prune'], checkout).catch(() => {});
  };
  await cleanup();
  try {
    await git(['fetch', '--no-tags', '--quiet', 'origin', sha], checkout);
    await git(['cat-file', '-e', `${sha}^{commit}`], checkout);
  } catch {
    throw new Error(
      `Could not fetch commit ${sha.slice(0, 12)} from the runner checkout's origin. Push it first.`
    );
  }
  try {
    await git(['worktree', 'add', '--detach', '--quiet', path, sha], checkout);
  } catch {
    await cleanup();
    throw new Error('Could not create a temporary worktree for the commit.');
  }
  return { path, cleanup };
}

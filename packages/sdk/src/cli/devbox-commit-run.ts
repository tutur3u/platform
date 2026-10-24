import { execFile } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { getDefaultConfigPath } from './config';

// Typed envelope for running an exact pushed commit on a trusted runner.
// The client never sends shell text: only a SHA, a relative directory and an
// argv, each validated here before any git or process work starts.
export const COMMIT_RUN_ENVELOPE = '__ttr_commit_run_v1__';
// Envelope versions this runner decodes; advertised in heartbeats so clients
// only submit commit runs to runners that understand them.
export const COMMIT_RUN_PROTOCOL_VERSIONS = [1] as const;

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

type Git = (args: string[], cwd: string) => Promise<string>;
const realGit: Git = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout)))
    );
  });

const RUN_PREFIX = 'ttr-commit-run-';

// Commit worktrees live under a directory only the runner account can enter,
// never in shared /tmp where another local account could pre-create or swap
// the path before `git worktree add` and get code run as the runner.
export function getCommitRunStateDir(env: NodeJS.ProcessEnv = process.env) {
  return join(
    dirname(
      getDefaultConfigPath({ env, homeDir: homedir(), platform: platform() })
    ),
    'commit-runs'
  );
}

async function ensurePrivateDirectory(path: string) {
  await mkdir(path, { mode: 0o700, recursive: true });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (typeof process.getuid === 'function' && info.uid !== process.getuid())
  )
    throw new Error(
      'Commit run state directory must be a real directory owned by the runner.'
    );
  if ((info.mode & 0o077) !== 0) await chmod(path, 0o700);
}

// Fetches origin's branches into the runner's checkout and creates a
// throwaway detached worktree in a fresh private directory. The SHA must be
// reachable from refs/remotes/origin/*: GitHub serves any commit in a fork
// network by SHA, so a fetchable commit alone proves nothing about origin.
// Errors stay generic because git stderr can include remote URLs, which may
// embed credentials.
export async function prepareCommitWorktree({
  checkout,
  sha,
  runId,
  stateDir = getCommitRunStateDir(),
  git = realGit,
}: {
  checkout: string;
  sha: string;
  runId: string;
  stateDir?: string;
  git?: Git;
}) {
  try {
    await git(
      [
        'fetch',
        '--no-tags',
        '--quiet',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
      ],
      checkout
    );
    await git(['cat-file', '-e', `${sha}^{commit}`], checkout);
  } catch {
    throw new Error(
      `Could not fetch commit ${sha.slice(0, 12)} from the runner checkout's origin. Push it first.`
    );
  }
  const containing = await git(
    [
      'for-each-ref',
      '--count=1',
      '--format=%(refname)',
      `--contains=${sha}`,
      'refs/remotes/origin/',
    ],
    checkout
  ).catch(() => '');
  if (!containing.trim())
    throw new Error(
      `Commit ${sha.slice(0, 12)} is not on any origin branch. Push it to origin first.`
    );

  await ensurePrivateDirectory(stateDir);
  const root = await mkdtemp(
    join(
      stateDir,
      `${RUN_PREFIX}${runId.replace(/[^a-zA-Z0-9-]/gu, '').slice(0, 64)}-`
    )
  );
  // A path inside the fresh 0700 directory that does not exist yet.
  const path = join(root, 'tree');
  const cleanup = async () => {
    await git(['worktree', 'remove', '--force', path], checkout).catch(
      () => {}
    );
    await rm(root, { force: true, recursive: true }).catch(() => {});
    await git(['worktree', 'prune'], checkout).catch(() => {});
  };
  try {
    await git(['worktree', 'add', '--detach', '--quiet', path, sha], checkout);
  } catch {
    await cleanup();
    throw new Error('Could not create a temporary worktree for the commit.');
  }
  return { path, cleanup };
}

// Agent startup: no job is active yet, so every commit worktree left by a
// crashed or killed agent is stale. Remove them and prune git's records.
export async function sweepStaleCommitWorktrees({
  checkout,
  stateDir = getCommitRunStateDir(),
  git = realGit,
}: {
  checkout: string;
  stateDir?: string;
  git?: Git;
}) {
  const entries = await readdir(stateDir).catch(() => [] as string[]);
  const stale = entries.filter((name) => name.startsWith(RUN_PREFIX));
  if (!stale.length) return 0;
  for (const name of stale) {
    await git(
      ['worktree', 'remove', '--force', join(stateDir, name, 'tree')],
      checkout
    ).catch(() => {});
    await rm(join(stateDir, name), { force: true, recursive: true }).catch(
      () => {}
    );
  }
  await git(['worktree', 'prune'], checkout).catch(() => {});
  return stale.length;
}

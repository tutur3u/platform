import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

/** Bump when the managed hook or gh shim template changes. */
export const GIT_GUARD_VERSION = 1;

export const DEFAULT_GUARDED_REPOS = ['tutur3u/platform', 'upskii/platform'];
export const DEFAULT_FF_ONLY_BRANCHES = ['main', 'production'];
export const DEFAULT_EXISTING_ONLY_PREFIXES = ['release-please--branches--'];

export interface GitGuardConfig {
  enabled: boolean;
  machine: string;
  /** owner/repo slugs (lowercase) whose pushes and PRs are guarded. */
  repos: string[];
  /** Branches that may be pushed, fast-forward only; never deleted. */
  ffOnlyBranches: string[];
  /** Prefixes that may be updated only when the branch already exists. */
  existingOnlyPrefixes: string[];
  /** Extra branch globs that may be created or updated (`*` wildcard). */
  allowBranches: string[];
  /** `refuse` (default) or `allow` updates to other existing branches. */
  existingBranches: 'refuse' | 'allow';
}

export function gitGuardHome(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.TTR_GIT_GUARD_HOME?.trim() || join(homedir(), '.tuturuuu', 'git-guard')
  );
}

export const guardPaths = (home: string) => ({
  config: join(home, 'config.json'),
  manifest: join(home, 'manifest.json'),
  hooks: join(home, 'hooks'),
  bin: join(home, 'bin'),
  log: join(home, 'log.jsonl'),
  overrides: join(home, 'overrides'),
  consumed: join(home, 'overrides', 'consumed'),
});

export function defaultGitGuardConfig(machine = hostname()): GitGuardConfig {
  return {
    enabled: true,
    machine,
    repos: [...DEFAULT_GUARDED_REPOS],
    ffOnlyBranches: [...DEFAULT_FF_ONLY_BRANCHES],
    existingOnlyPrefixes: [...DEFAULT_EXISTING_ONLY_PREFIXES],
    allowBranches: [],
    existingBranches: 'refuse',
  };
}

const strings = (value: unknown, fallback: string[]) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : fallback;

export function normalizeGitGuardConfig(raw: unknown): GitGuardConfig {
  const base = defaultGitGuardConfig();
  if (!raw || typeof raw !== 'object') return { ...base, enabled: false };
  const value = raw as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    machine:
      typeof value.machine === 'string' && value.machine.trim()
        ? value.machine.trim()
        : base.machine,
    repos: strings(value.repos, base.repos).map((repo) => repo.toLowerCase()),
    ffOnlyBranches: strings(value.ffOnlyBranches, base.ffOnlyBranches),
    existingOnlyPrefixes: strings(
      value.existingOnlyPrefixes,
      base.existingOnlyPrefixes
    ),
    allowBranches: strings(value.allowBranches, base.allowBranches),
    existingBranches: value.existingBranches === 'allow' ? 'allow' : 'refuse',
  };
}

/** A missing or unreadable config means the guard is off on this machine. */
export async function readGitGuardConfig(home = gitGuardHome()) {
  const text = await readFile(guardPaths(home).config, 'utf8').catch(
    () => null
  );
  if (text === null) return null;
  try {
    return normalizeGitGuardConfig(JSON.parse(text));
  } catch {
    throw new Error(
      `Invalid git guard config at ${guardPaths(home).config}; fix or reinstall it.`
    );
  }
}

export async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const staged = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(staged, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(staged, path);
}

export function writeGitGuardConfig(
  config: GitGuardConfig,
  home = gitGuardHome()
) {
  return writeJsonAtomic(guardPaths(home).config, config);
}

/**
 * Extract a lowercase `owner/repo` from a remote URL (https, ssh, scp-like,
 * file path, or an `owner/repo` slug): the last two path segments. Anything
 * before them, including credentials embedded in the URL, is discarded and
 * never returned, so the result is safe to log.
 */
export function repoSlugFromRemote(remote: string | undefined) {
  if (!remote) return null;
  const segments = remote
    .trim()
    .replace(/[?#].*$/u, '')
    .replace(/\/+$/u, '')
    .replace(/\.git$/u, '')
    .split(/[/:]/u)
    .filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, repo] = segments.slice(-2);
  const valid = /^[A-Za-z0-9_.-]+$/u;
  if (!valid.test(owner!) || !valid.test(repo!)) return null;
  return `${owner}/${repo}`.toLowerCase();
}

export function globMatch(pattern: string, value: string) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'u').test(value);
}

export function isGuardedRepo(config: GitGuardConfig, slug: string | null) {
  return Boolean(slug && config.repos.includes(slug.toLowerCase()));
}

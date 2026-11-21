import { execFileSync } from 'node:child_process';

/**
 * Build-time `PLATFORM_LOCAL_BUILD_*` values for bundler configs (Vite `define`,
 * Next `env`). Node-only: import it from config files, never from app code.
 *
 * CI and other reproducible builds return nothing, so their emitted artifacts
 * stay byte-identical and keep the metadata that
 * `scripts/ci/generate-build-metadata.ts` writes from the checked-out commit.
 * Every other build, including a dev server, is stamped with the time the
 * config was loaded (dev-server or build start) and the local Git commit and
 * branch, so the version badge never shows "local" when Git can answer.
 *
 * The names are separate from the runtime `PLATFORM_BUILD_*` variables, so an
 * inlined stamp never shadows metadata a deployment supplies at runtime:
 * `getPlatformReleaseInfo` reads them only after runtime and generated values.
 */

export type PlatformBuildEnvName =
  | 'PLATFORM_LOCAL_BUILD_BUILT_AT'
  | 'PLATFORM_LOCAL_BUILD_COMMIT_HASH'
  | 'PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE'
  | 'PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH'
  | 'PLATFORM_LOCAL_BUILD_REF_NAME';

export type PlatformBuildEnv = Partial<Record<PlatformBuildEnvName, string>>;

type Environment = Record<string, string | undefined>;

export type ResolveLocalPlatformBuildEnvOptions = {
  cwd?: string;
  env?: Environment;
  git?: (args: string[]) => string | null;
  now?: () => Date;
};

function readGit(cwd: string | undefined, args: string[]): string | null {
  try {
    const value = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** True for CI runners and builds pinned to a source date. */
export function isReproduciblePlatformBuild(env: Environment): boolean {
  const ci = clean(env.CI)?.toLowerCase() ?? null;
  return (
    (ci !== null && ci !== '0' && ci !== 'false') ||
    clean(env.SOURCE_DATE_EPOCH) !== null
  );
}

export function resolveLocalPlatformBuildEnv({
  cwd,
  env = process.env,
  git,
  now = () => new Date(),
}: ResolveLocalPlatformBuildEnvOptions = {}): PlatformBuildEnv {
  if (isReproduciblePlatformBuild(env)) {
    return {};
  }

  const read = git ?? ((args: string[]) => readGit(cwd, args));
  const values: PlatformBuildEnv = {
    PLATFORM_LOCAL_BUILD_BUILT_AT:
      clean(env.PLATFORM_BUILD_BUILT_AT) ?? now().toISOString(),
  };

  // Commit fields move together: an explicit hash takes only explicit
  // companions, never the checkout's subject.
  const explicitHash = clean(env.PLATFORM_BUILD_COMMIT_HASH);
  const commitHash = explicitHash ?? clean(read(['rev-parse', 'HEAD']));
  if (commitHash) {
    values.PLATFORM_LOCAL_BUILD_COMMIT_HASH = commitHash;
    values.PLATFORM_LOCAL_BUILD_COMMIT_SHORT_HASH =
      (explicitHash ? clean(env.PLATFORM_BUILD_COMMIT_SHORT_HASH) : null) ??
      commitHash.slice(0, 7);
    const commitMessage = explicitHash
      ? clean(env.PLATFORM_BUILD_COMMIT_MESSAGE)
      : clean(read(['log', '-1', '--pretty=%s', commitHash]));
    if (commitMessage)
      values.PLATFORM_LOCAL_BUILD_COMMIT_MESSAGE = commitMessage;
  }

  const refName =
    clean(env.PLATFORM_BUILD_REF_NAME) ??
    clean(read(['branch', '--show-current']));
  if (refName) values.PLATFORM_LOCAL_BUILD_REF_NAME = refName;

  return values;
}

/** The same values as `process.env.*` keys for a Vite/Rolldown `define`. */
export function platformBuildDefines(
  values: PlatformBuildEnv
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      `process.env.${name}`,
      JSON.stringify(value),
    ])
  );
}

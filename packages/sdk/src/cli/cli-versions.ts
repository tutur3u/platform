import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { extractCliArchive } from './cli-versions-archive';
import {
  CLI_DOWNLOAD_TIMEOUT_MS,
  downloadVerifiedArchive,
  withAbortSignal,
  withCliDownloadDeadline,
} from './cli-versions-download';
import {
  filesManifest,
  materializePackage,
  readVerifiedFile,
  requireDirectory,
} from './cli-versions-manifest';
import { readCliState, writeCliState } from './cli-versions-state';
import { acquireUpgradeLock } from './devbox-upgrade-lock';
import { realExecutable } from './resources-command';
import { resourceHome } from './resources-config';

// Versioned side-by-side CLI installs. Every release lives in its own
// immutable directory under ~/.tuturuuu/cli/versions/<version>, installed
// from the integrity-verified npm tarball; running processes keep executing
// their own files. Only activation (current symlink, launchers, resource
// shims) changes what new invocations run, and resource shims move only at
// an idle queue through the target release's own supported setup.

export const cliStore = (home = homedir()) => join(home, '.tuturuuu', 'cli');
const REGISTRY = 'https://registry.npmjs.org';
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/u;
const launcherNames = ['ttr', 'tuturuuu', 'tutur3u'] as const;

const releaseSchema = z.object({
  version: z.string().regex(VERSION),
  integrity: z.string().startsWith('sha512-'),
  tarballSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  filesSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  files: z.number().int().positive(),
  source: z.string().url(),
  installedAt: z.string(),
});
export type InstalledRelease = z.infer<typeof releaseSchema>;

export type Runner = (
  command: string,
  args: string[],
  cwd: string
) => Promise<{ code: number; output: string }>;
export const runCommand: Runner = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk: unknown) => {
      output = (output + String(chunk)).slice(-16_384);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });

function resolveBunRuntime(explicit?: string) {
  if (explicit) return explicit;
  if (process.versions.bun) return process.execPath;
  try {
    const absolutePath = (process.env.PATH || '')
      .split(delimiter)
      .filter(isAbsolute)
      .join(delimiter);
    if (!absolutePath) throw new Error('No absolute Bun search directories.');
    return realpathSync(
      realExecutable('bun', join(resourceHome(), 'bin'), absolutePath)
    );
  } catch (error) {
    throw new Error(
      'Cannot find Bun. Bun is required for versioned CLI releases; install it or add it to PATH.',
      { cause: error }
    );
  }
}

/** Resolve an exact version or dist-tag from the npm registry. */
export async function resolveRelease(
  spec: string,
  {
    fetchImpl = globalThis.fetch,
    registry = REGISTRY,
    timeoutMs = CLI_DOWNLOAD_TIMEOUT_MS,
  } = {}
) {
  if (!VERSION.test(spec) && !/^[a-z][a-z0-9-]{0,30}$/u.test(spec))
    throw new Error(
      'Use an exact version (for example 0.29.0) or a dist-tag such as latest.'
    );
  return withCliDownloadDeadline(timeoutMs, async (signal) => {
    const response = await withAbortSignal(
      fetchImpl(`${registry}/tuturuuu/${encodeURIComponent(spec)}`, {
        redirect: 'error',
        signal,
      }),
      signal
    );
    if (!response.ok)
      throw new Error(
        `Registry lookup for tuturuuu@${spec} failed (${response.status}).`
      );
    const body = (await withAbortSignal(response.json(), signal)) as {
      version?: unknown;
      dist?: { tarball?: unknown; integrity?: unknown };
    };
    const version = String(body.version ?? '');
    const tarball = String(body.dist?.tarball ?? '');
    const integrity = String(body.dist?.integrity ?? '');
    // The supplier stays the registry that answered: no redirect to a mirror.
    if (
      !VERSION.test(version) ||
      !tarball.startsWith(`${registry}/tuturuuu/-/tuturuuu-${version}.tgz`) ||
      !integrity.startsWith('sha512-')
    )
      throw new Error(
        `Registry metadata for tuturuuu@${spec} is not a usable release.`
      );
    return { version, tarball, integrity };
  });
}

const packageDir = (dir: string) => join(dir, 'node_modules', 'tuturuuu');
export const releaseEntry = (dir: string) =>
  join(packageDir(dir), 'dist', 'cli', 'index.js');

/** Re-check an installed release against its recorded provenance. */
export async function verifyInstalled(dir: string) {
  await requireDirectory(dir);
  await requireDirectory(join(dir, 'node_modules'));
  const release = releaseSchema.parse(
    JSON.parse(
      (await readVerifiedFile(join(dir, 'release.json'))).toString('utf8')
    )
  );
  if (release.version !== basename(resolve(dir)))
    throw new Error(
      'CLI release version does not match its directory; reinstall it.'
    );
  const manifest = await filesManifest(packageDir(dir));
  if (!manifest.packageJson)
    throw new Error('CLI release package.json is missing.');
  const pkg = JSON.parse(manifest.packageJson.toString('utf8')) as {
    version?: string;
  };
  if (
    pkg.version !== release.version ||
    manifest.sha256 !== release.filesSha256 ||
    manifest.files !== release.files
  )
    throw new Error(
      `Installed tuturuuu@${release.version} no longer matches its verified files; reinstall it.`
    );
  return release;
}

async function withInstallLock<T>(store: string, action: () => Promise<T>) {
  await mkdir(store, { recursive: true, mode: 0o700 });
  const release = await acquireUpgradeLock(join(store, 'install.lock'));
  if (!release)
    throw new Error(
      'Another CLI install or activation is in progress; retry when it finishes.'
    );
  try {
    return await action();
  } finally {
    await release();
  }
}

/**
 * Install a release side by side: verify the registry tarball's sha512, let
 * bun install the validated extracted files (dependencies from the registry), verify
 * the installed package files equal the tarball, then publish the directory
 * with one rename. An already verified install is reused.
 */
export async function installRelease({
  spec,
  store = cliStore(),
  fetchImpl = globalThis.fetch,
  registry = REGISTRY,
  run = runCommand,
  bun,
  downloadTimeoutMs = CLI_DOWNLOAD_TIMEOUT_MS,
}: {
  spec: string;
  store?: string;
  fetchImpl?: typeof fetch;
  registry?: string;
  run?: Runner;
  bun?: string;
  downloadTimeoutMs?: number;
}) {
  const runtime = resolveBunRuntime(bun);
  const resolved = await resolveRelease(spec, {
    fetchImpl,
    registry,
    timeoutMs: downloadTimeoutMs,
  });
  return withInstallLock(store, async () => {
    const target = join(store, 'versions', resolved.version);
    const existing = await verifyInstalled(target).catch(() => undefined);
    if (existing) {
      await rm(join(target, `tuturuuu-${resolved.version}.tgz`), {
        force: true,
      });
      return { release: existing, path: target, reused: true };
    }
    if (
      await lstat(target).then(
        () => true,
        () => false
      )
    )
      throw new Error(
        `${target} exists but does not verify; inspect it and remove it explicitly before reinstalling.`
      );
    const bytes = await withCliDownloadDeadline(downloadTimeoutMs, (signal) =>
      downloadVerifiedArchive(resolved.tarball, resolved.integrity, {
        fetchImpl,
        signal,
      })
    );
    const staging = join(store, 'versions', `.staging-${randomUUID()}`);
    await mkdir(join(store, 'versions'), { recursive: true, mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    try {
      await mkdir(join(staging, 'verify'), { mode: 0o700 });
      await extractCliArchive(bytes, join(staging, 'verify'));
      const expected = await filesManifest(join(staging, 'verify', 'package'));
      await writeFile(
        join(staging, 'package.json'),
        `${JSON.stringify({ private: true, dependencies: { tuturuuu: 'file:./verify/package' } }, null, 2)}\n`
      );
      const installed = await run(
        runtime,
        ['install', '--production', '--ignore-scripts'],
        staging
      );
      if (installed.code !== 0)
        throw new Error(`bun install failed: ${installed.output}`);
      const actual = await materializePackage(staging, expected);
      await rm(join(staging, 'verify'), { recursive: true, force: true });
      const release: InstalledRelease = {
        version: resolved.version,
        integrity: resolved.integrity,
        tarballSha256: createHash('sha256').update(bytes).digest('hex'),
        filesSha256: actual.sha256,
        files: actual.files,
        source: resolved.tarball,
        installedAt: new Date().toISOString(),
      };
      await writeFile(
        join(staging, 'release.json'),
        `${JSON.stringify(release, null, 2)}\n`,
        { mode: 0o600 }
      );
      await rename(staging, target);
      return { release, path: target, reused: false };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });
}

export async function currentVersion(store = cliStore()) {
  try {
    const link = await readlink(join(store, 'current'));
    return link.split('/').at(-1);
  } catch {
    return undefined;
  }
}
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/**
 * Make `version` what new invocations run. Resource shims, when resource
 * control is set up, move first through the target release's own
 * `resources setup --force`, which refuses unless every owner and ticket has
 * drained; only then does the current symlink swap. Running processes keep
 * their own release. Rollback is activating the previous version.
 */
export async function activateRelease({
  version,
  store = cliStore(),
  resourcesHome = resourceHome(),
  run = runCommand,
  bun,
}: {
  version: string;
  store?: string;
  resourcesHome?: string;
  run?: Runner;
  bun?: string;
}) {
  if (!VERSION.test(version))
    throw new Error('Activate an exact installed version.');
  const runtime = resolveBunRuntime(bun);
  return withInstallLock(store, async () => {
    const target = join(store, 'versions', version);
    const release = await verifyInstalled(target);
    const priorState = await readCliState(store, VERSION);
    const config = JSON.parse(
      await readFile(join(resourcesHome, 'config.json'), 'utf8').catch(
        () => 'null'
      )
    ) as { roots?: string[] } | null;
    if (config?.roots?.[0]) {
      const setup = await run(
        runtime,
        [
          releaseEntry(target),
          'resources',
          'setup',
          '--root',
          config.roots[0],
          '--shell',
          'none',
          '--force',
          '--json',
        ],
        store
      );
      if (setup.code !== 0)
        throw new Error(
          `Resource shims were not handed to tuturuuu@${version}, so nothing was activated: ${setup.output.trim().split('\n').at(-1)}`
        );
    }
    const previous = await currentVersion(store);
    const temporary = join(store, `.current-${randomUUID()}`);
    await symlink(join('versions', version), temporary);
    await rename(temporary, join(store, 'current'));
    await mkdir(join(store, 'bin'), { recursive: true, mode: 0o700 });
    for (const name of launcherNames) {
      const path = join(store, 'bin', name);
      const staged = `${path}.${randomUUID()}.tmp`;
      await writeFile(
        staged,
        `#!/bin/sh\n# Managed by ttr upgrade\nexec ${shellQuote(runtime)} ${shellQuote(releaseEntry(join(store, 'current')))} "$@"\n`,
        { mode: 0o700 }
      );
      await chmod(staged, 0o700);
      await rename(staged, path);
    }
    const state = {
      current: version,
      previous:
        previous && previous !== version ? previous : priorState.previous,
      activatedAt: new Date().toISOString(),
    };
    await writeCliState(store, state);
    return {
      release,
      previous: state.previous,
      shims: Boolean(config?.roots?.[0]),
    };
  });
}

export async function listReleases(store = cliStore()) {
  const current = await currentVersion(store);
  const { previous } = await readCliState(store, VERSION);
  const names = await readdir(join(store, 'versions')).catch(
    () => [] as string[]
  );
  const releases = [];
  for (const name of names.filter((entry) => VERSION.test(entry)).sort()) {
    const release = await verifyInstalled(join(store, 'versions', name)).then(
      (value) => ({ ...value, verified: true }),
      () => ({ version: name, verified: false })
    );
    releases.push({
      ...release,
      current: name === current,
      previous: name === previous,
    });
  }
  return releases;
}

/** Remove old verified releases, never the current or previous one. */
export async function pruneReleases({
  keep,
  store = cliStore(),
}: {
  keep: number;
  store?: string;
}) {
  if (!Number.isInteger(keep) || keep < 0)
    throw new Error('--keep must be a non-negative integer.');
  return withInstallLock(store, async () => {
    const releases = (await listReleases(store)).filter(
      (entry) => entry.verified
    );
    const removable = releases
      .filter((entry) => !entry.current && !entry.previous)
      .sort((a, b) =>
        'installedAt' in a && 'installedAt' in b
          ? b.installedAt.localeCompare(a.installedAt)
          : 0
      )
      .slice(keep);
    for (const entry of removable)
      await rm(join(store, 'versions', entry.version), {
        recursive: true,
        force: true,
      });
    return removable.map((entry) => entry.version);
  });
}

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { availableParallelism, homedir, totalmem } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export interface ResourceConfig {
  version: 1;
  enabled: boolean;
  roots: string[];
  repositories: string[];
  turboConcurrency: number;
  vitestWorkers: number;
  buildJobs: number;
}

export function resourceHome() {
  return resolve(
    process.env.TTR_RESOURCES_HOME || join(homedir(), '.tuturuuu', 'resources')
  );
}

export function defaultResourceConfig(
  memory = totalmem(),
  cpus = availableParallelism()
): ResourceConfig {
  const workers = Math.max(
    1,
    Math.min(4, Math.floor(memory / 1024 ** 3 / 12), Math.floor(cpus / 2))
  );
  return {
    version: 1,
    enabled: true,
    roots: [],
    repositories: [],
    turboConcurrency: 1,
    vitestWorkers: workers,
    buildJobs: workers,
  };
}

export function canonical(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function contains(root: string, path: string) {
  const child = relative(root, path);
  return (
    child === '' ||
    (!child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
      child !== '..' &&
      !isAbsolute(child))
  );
}

// Resolve linked worktrees without spawning Git for every Node invocation.
export function repositoryIdentity(cwd: string): string | undefined {
  let current = canonical(cwd);
  for (;;) {
    const marker = join(current, '.git');
    if (existsSync(marker)) {
      try {
        const text = readFileSync(marker, 'utf8');
        const gitdir = /^gitdir: (.+)\s*$/m.exec(text)?.[1];
        if (!gitdir) return undefined;
        const directory = resolve(current, gitdir.trim());
        const common = join(directory, 'commondir');
        return canonical(
          existsSync(common)
            ? resolve(directory, readFileSync(common, 'utf8').trim())
            : directory
        );
      } catch {
        return canonical(marker);
      }
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resourceScope(config: ResourceConfig, cwd: string) {
  const path = canonical(cwd);
  return (
    config.roots.some((root) => contains(root, path)) ||
    config.repositories.includes(repositoryIdentity(path) || '')
  );
}

export async function readResourceConfig(
  home = resourceHome()
): Promise<ResourceConfig | undefined> {
  try {
    const data = JSON.parse(
      await readFile(join(home, 'config.json'), 'utf8')
    ) as ResourceConfig;
    if (
      data.version !== 1 ||
      typeof data.enabled !== 'boolean' ||
      !Array.isArray(data.roots) ||
      !data.roots.every(
        (root) => typeof root === 'string' && isAbsolute(root)
      ) ||
      !Array.isArray(data.repositories) ||
      !data.repositories.every(
        (root) => typeof root === 'string' && isAbsolute(root)
      ) ||
      ![data.turboConcurrency, data.vitestWorkers, data.buildJobs].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 64
      )
    ) {
      throw new Error(
        'Invalid resource configuration; rerun ttr resources setup.'
      );
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function atomicJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, path);
}

export function resourceEnvironment(config: ResourceConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    VITEST_MAX_WORKERS: String(config.vitestWorkers),
    TURBO_CONCURRENCY: String(config.turboConcurrency),
    CARGO_BUILD_JOBS: String(config.buildJobs),
  };
}

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { availableParallelism, homedir, totalmem } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';

const resourceConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  roots: z.array(z.string().refine(isAbsolute)),
  repositories: z.array(z.string().refine(isAbsolute)),
  turboConcurrency: z.number().int().min(1).max(64),
  vitestWorkers: z.number().int().min(1).max(64),
  buildJobs: z.number().int().min(1).max(64),
  validationLanes: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type ResourceConfig = z.infer<typeof resourceConfigSchema>;
export type ValidationLanes = 1 | 2;

export function resourceLanes(config: ResourceConfig): ValidationLanes {
  return config.validationLanes ?? 1;
}
// Include aggregate budgets even when floor division leaves lane caps unchanged.
export function resourcePolicyKey(config: ResourceConfig) {
  return JSON.stringify([
    resourceLanes(config),
    config.vitestWorkers,
    config.buildJobs,
    1,
  ]);
}
export function laneResourceConfig(config: ResourceConfig): ResourceConfig {
  const lanes = resourceLanes(config);
  const host = defaultResourceConfig();
  if (
    config.vitestWorkers < lanes ||
    config.buildJobs < lanes ||
    (lanes === 2 &&
      (config.vitestWorkers > host.vitestWorkers ||
        config.buildJobs > host.buildJobs))
  )
    throw new Error(
      'Lane worker totals must fit the configured and host budget.'
    );
  return {
    ...config,
    turboConcurrency: 1,
    vitestWorkers: Math.floor(config.vitestWorkers / lanes),
    buildJobs: Math.floor(config.buildJobs / lanes),
  };
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
    validationLanes: 1,
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
    const data = resourceConfigSchema.parse(
      JSON.parse(await readFile(join(home, 'config.json'), 'utf8'))
    );
    return data;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined;
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

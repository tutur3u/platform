import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { availableParallelism, homedir, totalmem } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';

const resourceConfigSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    roots: z.array(z.string().refine(isAbsolute)),
    repositories: z.array(z.string().refine(isAbsolute)),
    turboConcurrency: z.number().int().min(1).max(64),
    vitestWorkers: z.number().int().min(1).max(64),
    buildJobs: z.number().int().min(1).max(64),
    validationLanes: z.number().int().min(1).max(8).optional(),
    maxValidationLanes: z.number().int().min(1).max(8).optional(),
  })
  .refine(
    (config) =>
      (config.maxValidationLanes ?? config.validationLanes ?? 1) >=
      (config.validationLanes ?? 1)
  );
export type ResourceConfig = z.infer<typeof resourceConfigSchema>;
export type ValidationLanes = number;
export const maxResourceLanes = 8;

// Numeric policy fields clamp instead of failing: one out-of-range value must
// not brick every shim on the machine. Type errors still name the field.
const integerFields = {
  turboConcurrency: [1, 64, false],
  vitestWorkers: [1, 64, false],
  buildJobs: [1, 64, false],
  validationLanes: [1, maxResourceLanes, true],
  maxValidationLanes: [1, maxResourceLanes, true],
} as const;
const fieldExpectations: Record<string, string> = {
  version: 'must be 1',
  enabled: 'must be true or false',
  roots: 'must be a list of absolute paths',
  repositories: 'must be a list of absolute paths',
};
const warned = new Set<string>();
export function warnResourceConfig(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  process.stderr.write(`[ttr resources] config.json: ${message}\n`);
}
export function invalidResourceConfig(detail: string) {
  return new Error(
    `Invalid resource configuration: ${detail}. Edit config.json in the resource home (TTR_RESOURCES_HOME or ~/.tuturuuu/resources) or rerun ttr resources setup.`
  );
}
export function normalizeResourceConfig(
  raw: unknown,
  warn: (message: string) => void = warnResourceConfig
): ResourceConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw invalidResourceConfig('config.json must contain a JSON object');
  const input = { ...(raw as Record<string, unknown>) };
  for (const [field, [min, max, optional]] of Object.entries(integerFields)) {
    const value = input[field];
    if (value === undefined && optional) continue;
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw invalidResourceConfig(
        `${field} must be an integer from ${min} to ${max}`
      );
    const clamped = Math.min(max, Math.max(min, Math.trunc(value)));
    if (clamped !== value) {
      warn(
        `${field} must be an integer from ${min} to ${max}; using ${clamped}.`
      );
      input[field] = clamped;
    }
  }
  const lanes = (input.validationLanes as number | undefined) ?? 1;
  if (
    input.maxValidationLanes !== undefined &&
    (input.maxValidationLanes as number) < lanes
  ) {
    warn(
      `maxValidationLanes must be at least validationLanes (${lanes}); using ${lanes}.`
    );
    input.maxValidationLanes = lanes;
  }
  const parsed = resourceConfigSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const field = String(parsed.error.issues[0]?.path[0] ?? 'config');
  throw invalidResourceConfig(
    `${field} ${fieldExpectations[field] ?? 'has an unsupported value'}`
  );
}

export function resourceLanes(config: ResourceConfig): ValidationLanes {
  return config.validationLanes ?? 1;
}
export function resourceMaxLanes(config: ResourceConfig) {
  return config.maxValidationLanes ?? resourceLanes(config);
}
// Static guard for burst lanes; pressure and load gate each burst admission.
export function hostLaneCeiling(
  memory = totalmem(),
  cpus = availableParallelism()
) {
  return Math.max(
    1,
    Math.min(maxResourceLanes, Math.floor(memory / 1024 ** 3 / 4), cpus - 2)
  );
}
export function effectiveResourceLanes(config: ResourceConfig) {
  return Math.min(
    resourceMaxLanes(config),
    Math.max(resourceLanes(config), hostLaneCeiling())
  );
}
export function adaptiveHostBudget(
  memory = totalmem(),
  cpus = availableParallelism()
) {
  return Math.max(
    1,
    Math.min(8, Math.floor(memory / 1024 ** 3 / 8), Math.floor(cpus / 2))
  );
}
// Include aggregate budgets even when floor division leaves lane caps unchanged.
export function resourcePolicyKey(config: ResourceConfig) {
  return JSON.stringify([
    resourceLanes(config),
    resourceMaxLanes(config),
    config.vitestWorkers,
    config.buildJobs,
    1,
  ]);
}
// Explicit setup input fails with the offending option; runtime reads clamp.
export function assertLaneBudget(config: ResourceConfig) {
  const lanes = resourceLanes(config);
  const max = resourceMaxLanes(config);
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > maxResourceLanes)
    throw new Error(
      `--lanes must be an integer from 1 to ${maxResourceLanes}.`
    );
  if (!Number.isInteger(max) || max < lanes || max > maxResourceLanes)
    throw new Error(
      `--max-lanes must be an integer between the base lane count and ${maxResourceLanes}.`
    );
  const budget = laneHostBudget(config);
  if (
    (lanes > 1 || max > lanes) &&
    (config.vitestWorkers > budget || config.buildJobs > budget)
  )
    throw new Error(
      `--workers must be at most ${budget} on this host when using more than one lane.`
    );
}
function laneHostBudget(config: ResourceConfig) {
  const host = defaultResourceConfig();
  return resourceMaxLanes(config) > resourceLanes(config)
    ? Math.max(host.vitestWorkers, adaptiveHostBudget())
    : host.vitestWorkers;
}
// Each lane receives at least one worker and at most its share of the total.
export function laneResourceConfig(config: ResourceConfig): ResourceConfig {
  const lanes = resourceLanes(config);
  const adaptive = resourceMaxLanes(config) > lanes;
  const budget = laneHostBudget(config);
  let { vitestWorkers, buildJobs } = config;
  if (lanes > 1 || adaptive) {
    if (vitestWorkers > budget || buildJobs > budget)
      warnResourceConfig(
        `multi-lane worker totals must be at most ${budget} on this host; using ${budget}.`
      );
    vitestWorkers = Math.min(vitestWorkers, budget);
    buildJobs = Math.min(buildJobs, budget);
  }
  const divisor = adaptive ? effectiveResourceLanes(config) : lanes;
  return {
    ...config,
    turboConcurrency: 1,
    vitestWorkers: Math.max(1, Math.floor(vitestWorkers / divisor)),
    buildJobs: Math.max(1, Math.floor(buildJobs / divisor)),
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
  let text: string;
  try {
    text = await readFile(join(home, 'config.json'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalidResourceConfig('config.json is not valid JSON');
  }
  return normalizeResourceConfig(raw);
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

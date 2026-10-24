import { constants, existsSync, readdirSync } from 'node:fs';
import { lstat, open, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

// Report Turbo cache reuse after a resource-managed command. Turbo only writes
// a run summary for `--summarize`, so the flag is added for `turbo run`
// invocations and the summary we requested is removed after reading it.

export type TurboSummaryPlan = {
  args: string[];
  root?: string;
  owned: boolean;
  existing?: Set<string>;
};

const runners = new Set(['bun', 'bunx', 'npx', 'pnpm', 'yarn']);
const turboNames = new Set(['turbo', 'turbo:local']);
const skipFlags = ['--dry', '--dry-run', '--graph', '--help', '-h'];

async function openRegularFile(path: string) {
  const noFollow = constants.O_NOFOLLOW || 0;
  const flags = constants.O_RDONLY | noFollow | (constants.O_NONBLOCK || 0);
  if (noFollow) return open(path, flags);
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.ino === 0n)
    throw new Error('not-a-regular-file');
  const file = await open(path, flags);
  try {
    const after = await file.stat({ bigint: true });
    if (
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino
    ) {
      throw new Error('file-changed');
    }
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

function turboRunIndex(name: string, args: string[]) {
  const tool = basename(name);
  let start = 0;
  if (!turboNames.has(tool)) {
    if (!runners.has(tool)) return -1;
    // The runner's command must itself be turbo: `bun turbo:local run`,
    // `bunx turbo run`, `bun x turbo run` or `bun run turbo run`.
    start = -1;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === '--') return -1;
      if (arg.startsWith('-')) continue;
      if (['x', 'run', 'exec'].includes(arg) && start < 0) {
        start = -2;
        continue;
      }
      if (!turboNames.has(arg)) return -1;
      start = i + 1;
      break;
    }
    if (start < 0) return -1;
  }
  for (let i = start; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') return -1;
    if (arg.startsWith('-')) continue;
    return arg === 'run' ? i : -1;
  }
  return -1;
}

export function findTurboRoot(cwd: string) {
  let current = resolve(cwd);
  while (true) {
    if (
      existsSync(join(current, 'turbo.json')) &&
      existsSync(join(current, '.git'))
    )
      return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function planTurboSummary(
  name: string,
  args: string[],
  cwd: string
): TurboSummaryPlan {
  const plain = { args, owned: false };
  const index = turboRunIndex(name, args);
  if (index < 0) return plain;
  const flags = args.slice(index + 1);
  const end = flags.indexOf('--');
  const turboFlags = end < 0 ? flags : flags.slice(0, end);
  if (
    turboFlags.some((arg) =>
      skipFlags.some((flag) => arg === flag || arg.startsWith(`${flag}=`))
    )
  )
    return plain;
  const root = findTurboRoot(cwd);
  if (!root) return plain;
  if (
    turboFlags.some(
      (arg) => arg === '--summarize' || arg.startsWith('--summarize=')
    )
  )
    return { args, root, owned: false };
  return {
    args: [
      ...args.slice(0, index + 1),
      '--summarize=true',
      ...args.slice(index + 1),
    ],
    root,
    owned: true,
  };
}

type SummaryTask = {
  cache?: {
    status?: string;
    local?: boolean;
    remote?: boolean;
    timeSaved?: number;
  };
  execution?: { startTime?: number; endTime?: number };
};

export type TurboCacheReport = {
  total: number;
  cached: number;
  local: number;
  remote: number;
  executed: number;
  executedMs: number;
  savedMs: number;
};

export function summarizeTurboRun(summary: {
  tasks?: SummaryTask[];
}): TurboCacheReport {
  const report: TurboCacheReport = {
    total: 0,
    cached: 0,
    local: 0,
    remote: 0,
    executed: 0,
    executedMs: 0,
    savedMs: 0,
  };
  for (const task of summary.tasks ?? []) {
    report.total++;
    if (task.cache?.status === 'HIT') {
      report.cached++;
      if (task.cache.remote && !task.cache.local) report.remote++;
      else report.local++;
      report.savedMs += Math.max(0, task.cache.timeSaved ?? 0);
      continue;
    }
    const { startTime, endTime } = task.execution ?? {};
    if (typeof startTime === 'number' && typeof endTime === 'number') {
      report.executed++;
      report.executedMs += Math.max(0, endTime - startTime);
    }
  }
  return report;
}

export function formatDuration(ms: number) {
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
}

export function formatTurboCacheReport(report: TurboCacheReport) {
  return (
    `[ttr resources] turbo cache: ${report.cached}/${report.total} tasks cached ` +
    `(local ${report.local}, remote ${report.remote}); ` +
    `${report.executed} executed in ${formatDuration(report.executedMs)}; ` +
    `saved ~${formatDuration(report.savedMs)}\n`
  );
}

// Called from the spawn hook, after queueing and before opening the owned
// launch gate. A cancelled waiter never takes a snapshot or owns a summary.
export function snapshotTurboSummaries(plan: TurboSummaryPlan) {
  if (!plan.root) return;
  try {
    plan.existing = new Set(readdirSync(join(plan.root, '.turbo', 'runs')));
  } catch (error) {
    plan.existing =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
        ? new Set()
        : undefined;
  }
}

// Best effort: never change the command's exit status.
export async function reportTurboSummary(
  plan: TurboSummaryPlan,
  write: (line: string) => void = (line) => process.stderr.write(line)
) {
  const existing = plan.existing;
  if (!plan.root || !existing) return;
  try {
    const directory = join(plan.root, '.turbo', 'runs');
    const candidates = (await readdir(directory)).filter(
      (name) => name.endsWith('.json') && !existing.has(name)
    );
    if (candidates.length !== 1) return;
    const name = candidates[0]!;
    const path = join(directory, name);
    const file = await openRegularFile(path);
    let content: string;
    try {
      if (!(await file.stat()).isFile()) return;
      content = await file.readFile('utf8');
    } finally {
      await file.close();
    }
    const summary = JSON.parse(content);
    if (summary.id !== basename(name, '.json')) return;
    const report = summarizeTurboRun(summary);
    if (report.total > 0) write(formatTurboCacheReport(report));
    if (plan.owned) await rm(path, { force: true });
  } catch {
    /* A missing or partial summary only skips the report. */
  }
}

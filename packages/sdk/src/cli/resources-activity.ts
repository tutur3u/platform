import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResourceOwner } from './resources-slots';
import { systemProbe } from './resources-system-probes';

export const idleWarningMs = 10 * 60_000;
export const activitySampleMs = 30_000;
// Cumulative CPU below this between samples counts as idle (timer wakeups).
const activeCpuSeconds = 0.5;

export interface ResourceActivity {
  token: string;
  cpuSeconds: number;
  sampledAt: string;
  lastActiveAt: string;
}
export interface ProcessCpu {
  pid: number;
  parent: number;
  group: number;
  percent: number;
  seconds: number;
}

// ps TIME is [[dd-]hh:]mm:ss[.ss] on Linux and macOS (minutes may exceed 59).
export function parseCpuTime(value: string) {
  const [days, clock] = value.includes('-')
    ? [Number(value.split('-')[0]), value.split('-')[1]!]
    : [0, value];
  const parts = clock.split(':').map(Number).reverse();
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  return (
    days * 86_400 +
    (parts[0] ?? 0) +
    (parts[1] ?? 0) * 60 +
    (parts[2] ?? 0) * 3600
  );
}
export function parseProcessCpu(output: string): ProcessCpu[] {
  return output.split('\n').flatMap((line) => {
    const [pid, parent, group, percent, time] = line.trim().split(/\s+/);
    if (!pid || !time || !Number(pid)) return [];
    return [
      {
        pid: Number(pid),
        parent: Number(parent),
        group: Number(group),
        percent: Number(percent) || 0,
        seconds: parseCpuTime(time),
      },
    ];
  });
}
export async function processCpuTable() {
  try {
    const { stdout } = await systemProbe(
      'ps',
      ['-axo', 'pid=,ppid=,pgid=,%cpu=,time='],
      { timeout: 5000, maxBuffer: 16 * 1024 * 1024 }
    );
    return parseProcessCpu(stdout);
  } catch {
    return undefined;
  }
}
// The admitted workload is the launcher group plus any descendants that moved
// to their own group (for example, tools that call setsid).
export function ownerCpu(owner: ResourceOwner, table: ProcessCpu[]) {
  const root = owner.childPid;
  if (!root) return { percent: 0, seconds: 0, processes: 0 };
  const members = new Set<number>([root]);
  for (const row of table) if (row.group === root) members.add(row.pid);
  let size = -1;
  while (members.size !== size) {
    size = members.size;
    for (const row of table) if (members.has(row.parent)) members.add(row.pid);
  }
  const rows = table.filter((row) => members.has(row.pid));
  return {
    percent: rows.reduce((sum, row) => sum + row.percent, 0),
    seconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    processes: rows.length,
  };
}
export function nextActivity(
  token: string,
  cpuSeconds: number,
  previous: ResourceActivity | undefined,
  now = new Date()
): ResourceActivity {
  const active =
    !previous || cpuSeconds - previous.cpuSeconds >= activeCpuSeconds;
  return {
    token,
    cpuSeconds,
    sampledAt: now.toISOString(),
    lastActiveAt: active ? now.toISOString() : previous.lastActiveAt,
  };
}
export async function readActivity(slot: string, token: string) {
  try {
    const value = JSON.parse(
      await readFile(join(slot, 'activity.json'), 'utf8')
    ) as ResourceActivity;
    return value?.token === token &&
      Number.isFinite(Date.parse(value.lastActiveAt))
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
// Never recreate a released slot: write beside owner.json without mkdir.
async function writeActivity(slot: string, activity: ResourceActivity) {
  const temporary = join(slot, `.activity.${activity.token}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(activity)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, join(slot, 'activity.json'));
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
export function startActivitySampler(
  slot: string,
  owner: ResourceOwner,
  intervalMs = activitySampleMs
) {
  let previous: ResourceActivity | undefined;
  let pending: Promise<void> = Promise.resolve();
  let stopped = false;
  const sample = () => {
    pending = pending.then(async () => {
      const table = await processCpuTable();
      if (!table || stopped) return;
      previous = nextActivity(
        owner.token,
        ownerCpu(owner, table).seconds,
        previous
      );
      await writeActivity(slot, previous);
    });
  };
  sample();
  const timer = setInterval(sample, intervalMs);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending.catch(() => {});
  };
}
export function idleFor(
  owner: ResourceOwner,
  activity: ResourceActivity | undefined,
  cpu: { percent: number; seconds: number },
  now = Date.now()
) {
  if (cpu.percent > 0) return 0;
  if (activity) return Math.max(0, now - Date.parse(activity.lastActiveAt));
  // Owners from older releases have no samples: only flag work that never ran.
  const started = Date.parse(owner.startedAt || owner.queuedAt);
  return cpu.seconds < activeCpuSeconds && Number.isFinite(started)
    ? Math.max(0, now - started)
    : 0;
}

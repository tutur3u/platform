import { spawnSync } from 'node:child_process';
import { type CwdLister, isBusy } from './storage-holds';

// Live-use checks run immediately before every destructive storage action,
// manual or automatic. Every failure mode reports as in use or error, never
// as idle (fail closed). In particular, a process this user cannot inspect
// (another user's, or root's, when not running as root) has not been proven
// absent from a path, so incomplete visibility is an error, not "idle".

export type OpenFiles = 'none' | 'open' | 'error';

export interface RunResult {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error?: Error;
}
export type Run = (
  command: string,
  args: string[],
  timeoutMs: number
) => RunResult;

export const realRun: Run = (command, args, timeoutMs) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
};

/** Alive unless the kernel says the pid is gone (EPERM and unknowns: alive). */
export const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

const failure = (what: string, result: RunResult) =>
  `${what} failed (${result.error?.message ?? (result.signal ? `signal ${result.signal}` : `status ${result.status}`)})${result.stderr.trim() ? `: ${result.stderr.trim().slice(0, 200)}` : ''}`;

/**
 * Working directories of every process on the machine. Throws unless the
 * listing is complete: `ps` and `lsof` must both succeed without
 * diagnostics, this process must appear, and every process `ps` lists that
 * is still alive must have had its cwd inspected.
 */
export function listProcessCwdsStrict({
  run = realRun,
  alive = pidAlive,
  self = process.pid,
}: {
  run?: Run;
  alive?: (pid: number) => boolean;
  self?: number;
} = {}) {
  const ps = run('ps', ['-axo', 'pid=,uid='], 20_000);
  if (ps.error || ps.signal || ps.status !== 0 || ps.stderr.trim())
    throw new Error(failure('process table (ps)', ps));
  const table = new Map<number, number>();
  for (const raw of ps.stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s+(\d+)$/u);
    if (!match) throw new Error(`unparseable ps line: ${line.slice(0, 80)}`);
    table.set(Number(match[1]), Number(match[2]));
  }
  if (!table.has(self))
    throw new Error('ps did not list this process; the table is incomplete');

  const lsof = run('lsof', ['-a', '-d', 'cwd', '-Fpn'], 30_000);
  if (lsof.error || lsof.signal || lsof.status !== 0 || lsof.stderr.trim())
    throw new Error(failure('cwd scan (lsof)', lsof));
  const cwds: { pid: number; cwd: string }[] = [];
  const inspected = new Set<number>();
  let pid = 0;
  for (const line of lsof.stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('p')) {
      pid = Number(line.slice(1));
      if (!Number.isInteger(pid) || pid <= 0)
        throw new Error(`unparseable lsof line: ${line.slice(0, 80)}`);
    } else if (line.startsWith('n')) {
      if (!pid) throw new Error('lsof listed a name before a process');
      cwds.push({ pid, cwd: line.slice(1) });
      inspected.add(pid);
    } else if (!line.startsWith('f'))
      throw new Error(`unexpected lsof field: ${line.slice(0, 80)}`);
  }
  if (!inspected.has(self))
    throw new Error('lsof did not list this process; the cwd scan is partial');
  const hidden = [...table].filter(
    ([entry]) => !inspected.has(entry) && alive(entry)
  );
  if (hidden.length) {
    const uids = [...new Set(hidden.map(([, uid]) => uid))].sort(
      (a, b) => a - b
    );
    throw new Error(
      `process visibility incomplete: ${hidden.length} live process(es) of uid ${uids.join(', ')} could not be inspected, so their working directories and open files are not proven absent`
    );
  }
  return cwds;
}

/**
 * Best-effort cwds of this user's processes, for reports only (analysis).
 * Destructive callers use the strict listing.
 */
export function listVisibleCwds(run: Run = realRun) {
  const result = run(
    'lsof',
    ['-a', '-d', 'cwd', '-Fpn', '-u', String(process.getuid?.() ?? '')],
    20_000
  );
  if (result.error || result.signal || result.status !== 0)
    throw new Error(failure('cwd scan (lsof)', result));
  const cwds: { pid: number; cwd: string }[] = [];
  let pid = 0;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n/')) cwds.push({ pid, cwd: line.slice(1) });
  }
  return cwds;
}

/**
 * Whether any other process holds a file under `path` (`lsof +D`). Any open
 * file found is proof of use whatever the exit status (lsof exits 1 even
 * then); "none" needs exit 1, no output and no diagnostics. Only meaningful
 * after the strict cwd scan proved every process inspectable.
 */
export function openFilesUnder(
  path: string,
  { run = realRun, self = process.pid }: { run?: Run; self?: number } = {}
): OpenFiles {
  const result = run('lsof', ['-Fp', '+D', path], 120_000);
  if (result.error || result.signal) return 'error';
  const pids: number[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('p')) pids.push(Number(line.slice(1)));
    else if (!line.startsWith('f')) return 'error';
  }
  if (pids.some((pid) => pid !== self)) return 'open';
  if (result.stderr.trim()) return 'error';
  if (result.status === 1 && !pids.length) return 'none';
  return result.status === 0 && pids.length ? 'none' : 'error';
}

export interface Liveness {
  /** Process working directories; throws unless every process was inspected. */
  cwds: CwdLister;
  /** Whether any process (other than this one) holds a file under `path`. */
  openFiles: (path: string) => OpenFiles;
  /** Full process command lines, or null when `ps` fails. */
  commands: () => string[] | null;
}

export const realLiveness: Liveness = {
  cwds: () => listProcessCwdsStrict(),
  openFiles: (path) => openFilesUnder(path),
  commands: () => {
    const result = realRun('ps', ['-axo', 'command='], 20_000);
    return result.status === 0 && !result.error && !result.signal
      ? result.stdout.split('\n')
      : null;
  },
};

/** Names of the liveness checks a path passed, or the reason it failed. */
export function checkPathIdle(
  paths: string[],
  liveness: Pick<Liveness, 'cwds' | 'openFiles'>
): { ok: true; checks: string[] } | { ok: false; reason: string } {
  if (!paths.length) return { ok: true, checks: [] };
  let cwds: ReturnType<CwdLister>;
  try {
    cwds = liveness.cwds();
  } catch (error) {
    return {
      ok: false,
      reason: `cwd scan failed: ${(error as Error).message}`,
    };
  }
  for (const path of paths) {
    if (isBusy(path, cwds))
      return { ok: false, reason: `a process is working inside ${path}` };
    let open: OpenFiles;
    try {
      open = liveness.openFiles(path);
    } catch {
      open = 'error';
    }
    if (open === 'open')
      return { ok: false, reason: `a process has files open under ${path}` };
    if (open === 'error')
      return { ok: false, reason: `open-file scan failed for ${path}` };
  }
  return { ok: true, checks: ['cwd-scan', 'open-files'] };
}

/** Fails closed: an unreadable process list counts as busy. */
export function commandRunning(
  liveness: Pick<Liveness, 'commands'>,
  pattern: RegExp
) {
  const lines = liveness.commands();
  return lines === null || lines.some((line) => pattern.test(line));
}

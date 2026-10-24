import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { type CwdLister, isBusy } from './storage-holds';
import { type PrivacyProof, privateTreeProof } from './storage-privacy';

// Live-use checks run immediately before every destructive storage action,
// manual or automatic. Every failure mode reports as in use or error, never
// as idle (fail closed). In particular, a process this user cannot inspect
// (another user's, or root's, when not running as root) has not been proven
// absent from a path, so incomplete visibility is an error, not "idle".

export type OpenFiles = 'none' | 'open' | 'error';

// System tools are run by absolute path, never through PATH, so a shim
// directory (ttr resources) or a planted binary cannot answer for them. A
// missing tool makes the spawn fail, which every caller treats as an error.
const SYSTEM_TOOLS: Record<'ps' | 'lsof', string[]> = {
  ps: ['/bin/ps', '/usr/bin/ps'],
  lsof: ['/usr/sbin/lsof', '/usr/bin/lsof', '/sbin/lsof', '/bin/lsof'],
};
export const systemTool = (
  name: keyof typeof SYSTEM_TOOLS,
  exists: (path: string) => boolean = existsSync
) => SYSTEM_TOOLS[name].find((path) => exists(path)) ?? SYSTEM_TOOLS[name][0]!;

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

export interface ProcessScan {
  cwds: { pid: number; cwd: string }[];
  /** Live processes of other uids this user could not inspect. */
  hidden: { pid: number; uid: number }[];
}

const incomplete = (hidden: ProcessScan['hidden']) => {
  const uids = [...new Set(hidden.map((entry) => entry.uid))].sort(
    (a, b) => a - b
  );
  return `process visibility incomplete: ${hidden.length} live process(es) of uid ${uids.join(', ')} could not be inspected, so their working directories and open files are not proven absent`;
};

/**
 * Working directories of every process this user can inspect. `ps` and
 * `lsof` must both succeed without diagnostics and this process must appear.
 * Every live process of the effective user must have been inspected (else
 * this throws). Processes of other uids that could not be inspected are
 * returned as `hidden`; that is accepted only on macOS for a non-root user,
 * where each path then needs a private-tree proof (see storage-privacy).
 */
export function scanProcesses({
  run = realRun,
  alive = pidAlive,
  self = process.pid,
  euid = process.geteuid?.() ?? -1,
  platform = process.platform,
}: {
  run?: Run;
  alive?: (pid: number) => boolean;
  self?: number;
  euid?: number;
  platform?: NodeJS.Platform;
} = {}): ProcessScan {
  const ps = run(systemTool('ps'), ['-axo', 'pid=,uid='], 20_000);
  if (ps.error || ps.signal || ps.status !== 0 || ps.stderr.trim())
    throw new Error(failure('process table (ps)', ps));
  const table = new Map<number, number>();
  for (const raw of ps.stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // macOS reports `nobody` as uid -2.
    const match = line.match(/^(\d+)\s+(-?\d+)$/u);
    if (!match) throw new Error(`unparseable ps line: ${line.slice(0, 80)}`);
    table.set(Number(match[1]), Number(match[2]));
  }
  if (!table.has(self))
    throw new Error('ps did not list this process; the table is incomplete');

  const lsof = run(systemTool('lsof'), ['-a', '-d', 'cwd', '-Fpn'], 30_000);
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
  const hidden = [...table]
    .filter(([entry]) => !inspected.has(entry) && alive(entry))
    .map(([entry, uid]) => ({ pid: entry, uid }));
  const own = hidden.filter((entry) => entry.uid === euid);
  if (own.length) throw new Error(incomplete(own));
  if (hidden.length && (platform !== 'darwin' || euid <= 0))
    throw new Error(incomplete(hidden));
  return { cwds, hidden };
}

/**
 * Working directories of every process on the machine. Throws unless every
 * live process, of any uid, was inspected.
 */
export function listProcessCwdsStrict(
  options: Parameters<typeof scanProcesses>[0] = {}
) {
  const scan = scanProcesses(options);
  if (scan.hidden.length) throw new Error(incomplete(scan.hidden));
  return scan.cwds;
}

/**
 * Best-effort cwds of this user's processes, for reports only (analysis).
 * Destructive callers use the strict listing.
 */
export function listVisibleCwds(run: Run = realRun) {
  const result = run(
    systemTool('lsof'),
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
  {
    run = realRun,
    self = process.pid,
    userOnly = false,
    euid = process.geteuid?.() ?? -1,
  }: { run?: Run; self?: number; userOnly?: boolean; euid?: number } = {}
): OpenFiles {
  // Under a private-tree proof only this user's processes can reach the
  // path, so the scan is scoped to them (no diagnostics about others).
  const args = userOnly
    ? ['-a', '-u', String(euid), '-Fp', '+D', path]
    : ['-Fp', '+D', path];
  if (userOnly && euid <= 0) return 'error';
  const result = run(systemTool('lsof'), args, 120_000);
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
  /**
   * The process scan with any hidden foreign processes (see scanProcesses).
   * Without it, `cwds` must be complete.
   */
  scan?: () => ProcessScan;
  /** Private-tree proof for a path under its rule root (see storage-privacy). */
  privacy?: (path: string, root: string) => PrivacyProof;
  /** Whether any process (other than this one) holds a file under `path`. */
  openFiles: (path: string, options?: { userOnly?: boolean }) => OpenFiles;
  /** Full process command lines, or null when `ps` fails. */
  commands: () => string[] | null;
}

export const realLiveness: Liveness = {
  cwds: () => listProcessCwdsStrict(),
  scan: () => scanProcesses(),
  privacy: (path, root) => privateTreeProof(path, root),
  openFiles: (path, options) => openFilesUnder(path, options),
  commands: () => {
    const result = realRun(systemTool('ps'), ['-axo', 'command='], 20_000);
    return result.status === 0 && !result.error && !result.signal
      ? result.stdout.split('\n')
      : null;
  },
};

export type IdleLiveness = Pick<Liveness, 'cwds' | 'openFiles'> &
  Partial<Pick<Liveness, 'scan' | 'privacy'>>;

/**
 * Names of the liveness checks a path passed (including the evidence level,
 * `full-visibility` or `private-tree`), or the reason it failed. `rootOf`
 * gives each path's rule root for the private-tree proof (default: its
 * parent directory).
 */
export function checkPathIdle(
  paths: string[],
  liveness: IdleLiveness,
  rootOf: (path: string) => string = (path) => dirname(path)
): { ok: true; checks: string[] } | { ok: false; reason: string } {
  if (!paths.length) return { ok: true, checks: [] };
  let scan: ProcessScan;
  try {
    scan = liveness.scan
      ? liveness.scan()
      : { cwds: liveness.cwds(), hidden: [] };
  } catch (error) {
    return {
      ok: false,
      reason: `cwd scan failed: ${(error as Error).message}`,
    };
  }
  const privateTree = scan.hidden.length > 0;
  for (const path of paths) {
    if (privateTree) {
      const proof = liveness.privacy?.(path, rootOf(path)) ?? {
        ok: false as const,
        reason: 'no private-tree proof available',
      };
      if (!proof.ok)
        return {
          ok: false,
          reason: `${incomplete(scan.hidden)}; ${path} is not provably private: ${proof.reason}`,
        };
    }
    if (isBusy(path, scan.cwds))
      return { ok: false, reason: `a process is working inside ${path}` };
    let open: OpenFiles;
    try {
      open = liveness.openFiles(
        path,
        privateTree ? { userOnly: true } : undefined
      );
    } catch {
      open = 'error';
    }
    if (open === 'open')
      return { ok: false, reason: `a process has files open under ${path}` };
    if (open === 'error')
      return { ok: false, reason: `open-file scan failed for ${path}` };
  }
  return {
    ok: true,
    checks: [
      'cwd-scan',
      'open-files',
      privateTree ? 'private-tree' : 'full-visibility',
    ],
  };
}

/** Fails closed: an unreadable process list counts as busy. */
export function commandRunning(
  liveness: Pick<Liveness, 'commands'>,
  pattern: RegExp
) {
  const lines = liveness.commands();
  return lines === null || lines.some((line) => pattern.test(line));
}

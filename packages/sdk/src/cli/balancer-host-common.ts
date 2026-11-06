// Shared by the shipped balancer host files; Node built-ins only.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const VERSION = 1;
export const RUN_ID = /^[A-Za-z0-9_-]{16,128}-r[1-8]$/u;
export const LEASE_ID = /^[0-9a-f-]{36}$/u;
export const SHA = /^[0-9a-f]{40}$/u;
export const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u;
export const LOG_LIMIT = 64 * 1024 * 1024;

export const home = () =>
  resolve(
    process.env.TTR_BALANCER_HOME || join(homedir(), '.tuturuuu', 'balancer')
  );
export const ttrPath = () =>
  process.env.TTR_BALANCER_TTR || join(homedir(), '.bun', 'bin', 'ttr');
export const runDir = (runId: string) => join(home(), 'runs', runId);
export const now = () => new Date().toISOString();

export interface StartSpec {
  v: number;
  runId: string;
  leaseId: string;
  fence: number;
  deviceId: string;
  repo: string;
  baseSha: string;
  cwd: string;
  command: string[];
  timeoutSeconds: number;
  install: boolean;
}

export function fail(message: string, code = 2): never {
  process.stdout.write(
    `${JSON.stringify({ v: VERSION, ok: false, error: message })}\n`
  );
  process.exit(code);
}
export function reply(value: Record<string, unknown>) {
  process.stdout.write(
    `${JSON.stringify({ v: VERSION, ok: true, ...value })}\n`
  );
}
export function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}
// Durable replace: write, fsync, rename. Readers see the old or new file.
export function writeJson(
  path: string,
  value: unknown,
  options: { exclusive?: boolean } = {}
) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const fd = openSync(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  );
  let failure: { error: unknown } | undefined;
  try {
    try {
      writeFileSync(fd, `${JSON.stringify(value)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (options.exclusive) {
      // A create-only notice retains the first complete publication.
      try {
        linkSync(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } else renameSync(temporary, path);
  } catch (error) {
    failure = { error };
  }
  try {
    unlinkSync(temporary);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      failure ??= { error };
  }
  if (failure) throw failure.error;
}

function checkPrivateFile(fd: number) {
  const info = fstatSync(fd);
  if (
    !info.isFile() ||
    info.uid !== (process.getuid?.() ?? -1) ||
    (info.mode & 0o077) !== 0
  )
    throw new Error(
      'Balancer log must be a regular private file owned by you.'
    );
  return info;
}

export function openLog(path: string) {
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600
  );
  try {
    checkPrivateFile(fd);
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

export function readLogTail(path: string) {
  let fd: number;
  try {
    fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const size = checkPrivateFile(fd).size;
    const length = Math.min(size, 64 * 1024);
    const buffer = Buffer.alloc(length);
    const count = readSync(fd, buffer, 0, length, size - length);
    return {
      exists: true,
      bytes: size,
      tail: buffer.subarray(0, count).toString('utf8'),
    };
  } finally {
    closeSync(fd);
  }
}
export const ensureDir = (path: string) =>
  mkdirSync(path, { recursive: true, mode: 0o700 });

export function validSpec(raw: unknown): StartSpec {
  const spec = raw as Partial<StartSpec>;
  if (!spec || spec.v !== VERSION) fail('unsupported start envelope');
  if (!RUN_ID.test(String(spec.runId))) fail('invalid runId');
  if (!LEASE_ID.test(String(spec.leaseId))) fail('invalid leaseId');
  if (!Number.isInteger(spec.fence) || (spec.fence as number) < 1)
    fail('invalid fence');
  if (!REPO.test(String(spec.repo))) fail('invalid repo');
  if (!SHA.test(String(spec.baseSha))) fail('invalid baseSha');
  const cwd = String(spec.cwd ?? '');
  if (
    cwd.length > 512 ||
    cwd.startsWith('/') ||
    cwd.includes('\\') ||
    cwd.includes('\0') ||
    (cwd !== '' &&
      cwd.split('/').some((part) => !part || part === '.' || part === '..'))
  )
    fail('invalid cwd');
  const command = spec.command;
  if (
    !Array.isArray(command) ||
    command.length < 1 ||
    command.length > 256 ||
    command.some(
      (part) =>
        typeof part !== 'string' || part.length > 8192 || part.includes('\0')
    ) ||
    !command[0] ||
    command[0].startsWith('__ttr_')
  )
    fail('invalid command');
  const timeout = Number(spec.timeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 30 || timeout > 6 * 3600)
    fail('invalid timeout');
  return spec as StartSpec;
}

// Start identity guards against PID reuse when judging supervisor liveness.
export function processStart(pid: number): string | undefined {
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    }
    const ps = existsSync('/bin/ps') ? '/bin/ps' : '/usr/bin/ps';
    const out = spawnSync(ps, ['-o', 'lstart=', '-p', String(pid)], {
      env: {},
      encoding: 'utf8',
    });
    return out.status === 0 && out.stdout.trim()
      ? out.stdout.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function runRecord(runId: string) {
  const dir = runDir(runId);
  return {
    lease: readJson(join(dir, 'lease.json')),
    phase: readJson(join(dir, 'phase.json')),
    result: readJson(join(dir, 'result.json')),
    supervisor: readJson(join(dir, 'supervisor.json')),
  };
}

export function supervisorAlive(
  supervisor: Record<string, unknown> | undefined
): boolean | null {
  if (!supervisor) return null;
  if (typeof supervisor.unit === 'string') {
    const out = spawnSync(
      'systemctl',
      ['--user', 'is-active', supervisor.unit],
      { encoding: 'utf8' }
    );
    const state = out.stdout.trim();
    if (
      state === 'active' ||
      state === 'activating' ||
      state === 'deactivating'
    )
      return true;
    if (state === 'inactive' || state === 'failed') return false;
    return null;
  }
  const pid = Number(supervisor.pid);
  if (!Number.isInteger(pid) || pid < 2) return null;
  try {
    process.kill(pid, 0);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? false : null;
  }
  const started = processStart(pid);
  if (started === undefined) return null;
  return started === supervisor.started;
}

export function supervisorEnv() {
  const keep = [
    'HOME',
    'USER',
    'LOGNAME',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'SHELL',
    'TTR_BALANCER_HOME',
    'TTR_BALANCER_TTR',
    'TTR_BALANCER_ORIGIN_URL',
    'TTR_RESOURCES_HOME',
  ];
  const env: Record<string, string> = {};
  for (const key of keep) if (process.env[key]) env[key] = process.env[key]!;
  const bunBin = join(homedir(), '.bun', 'bin');
  env.PATH = [
    bunBin,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':');
  env.CI = '1';
  env.TTR_ORCHESTRATOR_ID = 'ttr-balancer';
  return env;
}

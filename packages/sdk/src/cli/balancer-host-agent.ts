// Host side of the fleet balancer. This file and its balancer-host-* siblings
// are shipped byte-for-byte to each host (content-addressed by their SHA-256)
// and run with that host's own bun, so they import only Node built-ins and
// each other. The agent never decides placement: it records
// one exclusive run per lease, runs it inside the host's canonical
// `ttr resources run` queue, and reports the durable record.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statfsSync,
  statSync,
  writeSync,
} from 'node:fs';
import { arch, cpus, hostname, loadavg, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ensureDir,
  fail,
  home,
  LEASE_ID,
  LOG_LIMIT,
  now,
  processStart,
  RUN_ID,
  readJson,
  reply,
  runDir,
  runRecord,
  type StartSpec,
  supervisorAlive,
  supervisorEnv,
  ttrPath,
  VERSION,
  validSpec,
  writeJson,
} from './balancer-host-common';
import { job, removeCheckout } from './balancer-host-job';

function memoryPressure(): 'normal' | 'warn' | 'critical' | undefined {
  try {
    if (process.platform === 'darwin') {
      const out = spawnSync(
        '/usr/sbin/sysctl',
        ['-n', 'kern.memorystatus_vm_pressure_level'],
        {
          env: {},
          encoding: 'utf8',
        }
      );
      const level = Number(out.stdout.trim());
      return level === 1
        ? 'normal'
        : level === 2
          ? 'warn'
          : level === 4
            ? 'critical'
            : undefined;
    }
    const info = readFileSync('/proc/meminfo', 'utf8');
    const value = (key: string) =>
      Number(new RegExp(`^${key}:\\s+(\\d+)`, 'mu').exec(info)?.[1]);
    const ratio = value('MemAvailable') / value('MemTotal');
    if (!Number.isFinite(ratio)) return undefined;
    return ratio >= 0.25 ? 'normal' : ratio >= 0.1 ? 'warn' : 'critical';
  } catch {
    return undefined;
  }
}

function queueStatus() {
  const out = spawnSync(ttrPath(), ['resources', 'status', '--json'], {
    encoding: 'utf8',
    env: supervisorEnv(),
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  try {
    const status = JSON.parse(out.stdout);
    return {
      version: typeof status.version === 'string' ? status.version : undefined,
      queue: {
        enabled: status.enabled === true && status.config?.state === 'enabled',
        lanes: Number(status.laneCount),
        occupied: Array.isArray(status.owners)
          ? status.owners.length
          : Number.NaN,
        waiting: Array.isArray(status.waiting)
          ? status.waiting.length
          : Number.NaN,
      },
    };
  } catch {
    return { version: undefined, queue: undefined };
  }
}

function probe() {
  const { version, queue } = queueStatus();
  let diskFreeGiB: number | undefined;
  try {
    ensureDir(home());
    const stats = statfsSync(home());
    diskFreeGiB = (stats.bavail * stats.bsize) / 1024 ** 3;
  } catch {
    diskFreeGiB = undefined;
  }
  const activeRuns: string[] = [];
  try {
    for (const name of readdirSync(join(home(), 'runs')).slice(-500))
      if (RUN_ID.test(name) && !existsSync(join(runDir(name), 'result.json')))
        activeRuns.push(name);
  } catch {
    /* No runs yet. */
  }
  reply({
    hostname: hostname(),
    platform: process.platform,
    arch: arch(),
    cpus: cpus().length,
    memoryGiB: totalmem() / 1024 ** 3,
    load1: loadavg()[0],
    memoryPressure: memoryPressure(),
    diskFreeGiB,
    ttrVersion: version,
    queue,
    activeRuns,
  });
}

function start() {
  const spec = validSpec(JSON.parse(readFileSync(0, 'utf8')));
  ensureDir(join(home(), 'runs'));
  const dir = runDir(spec.runId);
  try {
    // Exclusive creation is the peer lease: one admission per run, ever.
    mkdirSync(dir, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = runRecord(spec.runId);
    if (
      existing.lease?.leaseId === spec.leaseId &&
      existing.lease?.fence === spec.fence
    )
      return reply({ accepted: true, duplicate: true, ...existing });
    return reply({
      accepted: false,
      reason: 'duplicate_admission',
      lease: existing.lease,
    });
  }
  writeJson(join(dir, 'lease.json'), { ...spec, acceptedAt: now() });
  writeJson(join(dir, 'phase.json'), { phase: 'accepted', at: now() });
  const agent = resolve(process.argv[1]!);
  const env = supervisorEnv();
  let supervisor: Record<string, unknown> | undefined;
  if (process.platform === 'linux' && !process.env.TTR_BALANCER_NO_SYSTEMD) {
    const unit = `ttr-balancer-${spec.runId}`;
    const runtime =
      process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.()}`;
    const out = spawnSync(
      'systemd-run',
      [
        '--user',
        '--collect',
        '--quiet',
        `--unit=${unit}`,
        ...Object.entries(env).map(([k, v]) => `--setenv=${k}=${v}`),
        '--',
        process.execPath,
        agent,
        'supervise',
        spec.runId,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, XDG_RUNTIME_DIR: runtime },
        timeout: 30_000,
      }
    );
    if (out.status === 0) supervisor = { unit, launchedAt: now() };
  }
  if (!supervisor) {
    const log = openSync(join(dir, 'supervisor.log'), 'a', 0o600);
    const child = spawn(process.execPath, [agent, 'supervise', spec.runId], {
      detached: true,
      stdio: ['ignore', log, log],
      env,
    });
    child.unref();
    closeSync(log);
    supervisor = {
      pid: child.pid,
      started: processStart(child.pid!),
      launchedAt: now(),
    };
  }
  writeJson(join(dir, 'supervisor.json'), supervisor);
  reply({ accepted: true, duplicate: false, supervisor });
}

function status(runId: string) {
  if (!RUN_ID.test(runId)) fail('invalid runId');
  if (!existsSync(runDir(runId))) return reply({ exists: false });
  const record = runRecord(runId);
  reply({
    exists: true,
    ...record,
    alive: record.result ? false : supervisorAlive(record.supervisor),
  });
}

function cancel(runId: string, leaseId: string) {
  if (!RUN_ID.test(runId) || !LEASE_ID.test(leaseId))
    fail('invalid identifiers');
  const record = runRecord(runId);
  if (!record.lease) return reply({ exists: false, signalled: false });
  if (record.lease.leaseId !== leaseId)
    return reply({ exists: true, signalled: false, reason: 'stale_lease' });
  if (record.result)
    return reply({ exists: true, signalled: false, result: record.result });
  if (!existsSync(join(runDir(runId), 'cancel.json')))
    writeJson(join(runDir(runId), 'cancel.json'), { leaseId, at: now() });
  let signalled = false;
  const supervisor = record.supervisor;
  if (typeof supervisor?.unit === 'string') {
    signalled =
      spawnSync('systemctl', [
        '--user',
        'kill',
        '--kill-whom=main',
        '--signal=SIGTERM',
        supervisor.unit,
      ]).status === 0;
  } else if (supervisorAlive(supervisor) === true) {
    try {
      process.kill(Number(supervisor!.pid), 'SIGTERM');
      signalled = true;
    } catch {
      signalled = false;
    }
  }
  reply({ exists: true, signalled });
}

async function supervise(runId: string) {
  const dir = runDir(runId);
  const spec = readJson(join(dir, 'lease.json')) as unknown as StartSpec;
  validSpec({ ...spec, v: VERSION });
  const startedAt = now();
  writeJson(join(dir, 'phase.json'), { phase: 'queued', at: startedAt });
  const logFd = openSync(join(dir, 'output.log'), 'a', 0o600);
  const hash = createHash('sha256');
  let logBytes = 0;
  const write = (chunk: Buffer) => {
    if (logBytes >= LOG_LIMIT) return;
    const slice = chunk.subarray(0, LOG_LIMIT - logBytes);
    writeSync(logFd, slice);
    hash.update(slice);
    logBytes += slice.length;
  };
  const child = spawn(
    ttrPath(),
    [
      'resources',
      'run',
      '--',
      process.execPath,
      resolve(process.argv[1]!),
      'job',
      runId,
    ],
    {
      cwd: dir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  let stopReason: 'cancel' | 'timeout' | undefined;
  const stop = (reason: 'cancel' | 'timeout') => {
    stopReason ??= reason;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 60_000).unref();
  };
  process.on('SIGTERM', () => stop('cancel'));
  process.on('SIGINT', () => stop('cancel'));
  process.on('SIGHUP', () => {});
  const timer = setTimeout(() => stop('timeout'), spec.timeoutSeconds * 1000);
  const exit = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((done) => child.on('close', (code, signal) => done({ code, signal })));
  clearTimeout(timer);
  closeSync(logFd);
  const job = readJson(join(dir, 'job-exit.json'));
  const admitted = existsSync(join(dir, 'admitted.json'));
  const cancelled =
    stopReason === 'cancel' || existsSync(join(dir, 'cancel.json'));
  const code = exit.code ?? (exit.signal ? 128 + 15 : 1);
  let status: string;
  let phase: string;
  let reason: string | undefined;
  if (stopReason === 'timeout') {
    status = 'failed';
    phase = admitted ? 'command' : 'admission';
    reason = `timed out after ${spec.timeoutSeconds}s`;
  } else if (cancelled && code !== 0) {
    status = 'cancelled';
    phase = admitted ? 'command' : 'admission';
  } else if (!admitted) {
    status = code === 75 ? 'rejected' : 'failed';
    phase = 'admission';
    reason =
      code === 75
        ? 'host resource admission refused the run'
        : 'the run never reached host admission';
  } else if (job?.phase === 'setup') {
    status = 'setup_failed';
    phase = 'setup';
    reason = String(job.reason ?? 'setup failed');
  } else {
    status = code === 0 ? 'succeeded' : 'failed';
    phase = 'command';
  }
  writeJson(join(dir, 'result.json'), {
    resultId: spec.leaseId,
    runId,
    fence: spec.fence,
    status,
    exitCode: stopReason === 'timeout' ? 124 : code,
    phase,
    startedAt,
    finishedAt: now(),
    logBytes,
    logSha256: hash.digest('hex'),
    ...(reason ? { reason } : {}),
  });
  writeJson(join(dir, 'phase.json'), { phase: 'finished', at: now() });
  await removeCheckout(spec, dir);
}

function log(runId: string) {
  if (!RUN_ID.test(runId)) fail('invalid runId');
  const path = join(runDir(runId), 'output.log');
  if (!existsSync(path)) return reply({ exists: false, tail: '' });
  const size = statSync(path).size;
  const fd = openSync(path, 'r');
  try {
    const length = Math.min(size, 64 * 1024);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    reply({ exists: true, bytes: size, tail: buffer.toString('utf8') });
  } finally {
    closeSync(fd);
  }
}

const [action, first, second] = process.argv.slice(2);
const main = async () => {
  if (action === 'probe') return probe();
  if (action === 'start') return start();
  if (action === 'status') return status(String(first));
  if (action === 'cancel') return cancel(String(first), String(second));
  if (action === 'log') return log(String(first));
  if (action === 'supervise' && RUN_ID.test(String(first)))
    return supervise(String(first));
  if (action === 'job' && RUN_ID.test(String(first))) return job(String(first));
  fail(
    'usage: probe | start | status <runId> | log <runId> | cancel <runId> <leaseId>'
  );
};
main().catch((error) =>
  fail(error instanceof Error ? error.message : String(error), 1)
);

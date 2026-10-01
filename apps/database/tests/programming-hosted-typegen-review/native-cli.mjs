import { spawn } from 'node:child_process';
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBundledSupabaseBinaryPath } from '../../scripts/run-supabase.js';
import {
  assertSyntheticCliEnvironment,
  CliEnvironmentFailure,
} from './cli-environment.mjs';

const phases = new Set([
  'command',
  'prepare',
  'run',
  'cleanup',
  'validate',
  'cli-resolve',
  'cli-version',
  'cli-services',
]);
const outcomes = new Set([
  'failed',
  'unavailable',
  'timeout',
  'output-limit',
  'interrupted',
]);
export class CliProbeFailure extends Error {
  constructor(phase, outcome) {
    super('Hosted CLI operation failed');
    this.phase = phases.has(phase) ? phase : 'prepare';
    this.outcome = outcomes.has(outcome) ? outcome : 'failed';
  }
}
export function verificationFailureStatus(mode, error) {
  if (error instanceof CliEnvironmentFailure)
    return 'Programming verification phase=cli-environment outcome=unavailable';
  const phase =
    error instanceof CliProbeFailure && phases.has(error.phase)
      ? error.phase
      : phases.has(mode)
        ? mode
        : 'prepare';
  const outcome =
    error instanceof CliProbeFailure && outcomes.has(error.outcome)
      ? error.outcome
      : 'failed';
  return `Programming verification phase=${phase} outcome=${outcome}`;
}

// Resolve the installed npm shim through the existing platform-package resolver.
// Never accept its wrapper fallback or a legacy supabase-go sidecar here.
export function resolveHostedNativeCli(
  wrapper,
  { platform = process.platform, arch = os.arch(), nativeOptions = {} } = {}
) {
  try {
    if (
      platform !== 'linux' ||
      !['x64', 'arm64'].includes(arch) ||
      !path.isAbsolute(wrapper)
    )
      throw new Error();
    const shim = realpathSync(wrapper);
    const candidate = getBundledSupabaseBinaryPath(shim, {
      ...nativeOptions,
      platform,
      arch,
    });
    if (!candidate || path.basename(candidate) !== 'supabase')
      throw new Error();
    const binary = realpathSync(candidate);
    if (
      binary === shim ||
      path.basename(binary) !== 'supabase' ||
      path.basename(path.dirname(binary)) !== 'bin'
    )
      throw new Error();
    const packageRoot = path.dirname(path.dirname(binary));
    const packageName = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
    ).name;
    if (
      ![
        `@supabase/cli-linux-${arch}`,
        `@supabase/cli-linux-${arch}-musl`,
      ].includes(packageName)
    )
      throw new Error();
    const stat = statSync(binary);
    if (!stat.isFile() || !(stat.mode & 0o111)) throw new Error();
    const header = Buffer.alloc(20);
    const fd = openSync(binary, 'r');
    try {
      if (readSync(fd, header, 0, header.length, 0) !== header.length)
        throw new Error();
    } finally {
      closeSync(fd);
    }
    if (
      !header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      header[4] !== 2 ||
      header[5] !== 1 ||
      ![2, 3].includes(header.readUInt16LE(16)) ||
      header.readUInt16LE(18) !== (arch === 'x64' ? 62 : 183)
    )
      throw new Error();
    return binary;
  } catch {
    throw new CliProbeFailure('cli-resolve', 'unavailable');
  }
}

// Captured probe text is consumed only in memory; diagnostics are fixed enums.
// One POSIX process group owns both the probe and any inherited descendants.
export function runCliProbe(
  binary,
  args,
  {
    phase,
    timeoutMs,
    maxOutputBytes = 4 * 1024 ** 2,
    env,
    cwd,
    signalSource = process,
    onSpawn = () => {},
  } = {}
) {
  if (
    !['cli-version', 'cli-services', 'command'].includes(phase) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isInteger(maxOutputBytes) ||
    maxOutputBytes < 1
  )
    throw new CliProbeFailure(phase, 'failed');
  assertSyntheticCliEnvironment(env, cwd);
  return new Promise((resolve, reject) => {
    const probeEnv = { ...env };
    if (phase !== 'command') delete probeEnv.SUPABASE_CLI_BINARY_OVERRIDE;
    let child;
    try {
      child = spawn(binary, args, {
        detached: true,
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: probeEnv,
      });
    } catch {
      reject(new CliProbeFailure(phase, 'failed'));
      return;
    }
    let outcome;
    let settled = false;
    let bytes = 0;
    const stdout = [];
    let timer;
    let groupKilled = false;
    const killGroup = () => {
      if (!child.pid || groupKilled) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
        groupKilled = true;
      } catch (error) {
        if (error.code !== 'ESRCH') outcome ??= 'failed';
      }
    };
    const abort = (reason) => {
      outcome ??= reason;
      finish(1);
    };
    const interrupt = () => abort('interrupted');
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signalSource.off('SIGINT', interrupt);
      signalSource.off('SIGTERM', interrupt);
      killGroup();
      if (outcome) {
        // An escaped descendant may retain the pipes after the owned group dies.
        // Close our read ends and settle without waiting for its close event.
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        stdout.length = 0;
      }
      if (outcome || code !== 0)
        reject(new CliProbeFailure(phase, outcome ?? 'failed'));
      else resolve(Buffer.concat(stdout).toString('utf8').trim());
    };
    const capture = (chunk, keep) => {
      if (outcome) return;
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        abort('output-limit');
        return;
      }
      if (keep) stdout.push(chunk);
    };
    child.stdout.on('data', (chunk) => capture(chunk, true));
    child.stderr.on('data', (chunk) => capture(chunk, false));
    child.once('error', () => {
      outcome ??= 'failed';
      finish(1);
    });
    child.once('exit', killGroup);
    child.once('close', finish);
    child.once('spawn', () => {
      try {
        onSpawn(child.pid);
      } catch {
        abort('failed');
      }
    });
    signalSource.once('SIGINT', interrupt);
    signalSource.once('SIGTERM', interrupt);
    timer = setTimeout(() => abort('timeout'), timeoutMs);
  });
}

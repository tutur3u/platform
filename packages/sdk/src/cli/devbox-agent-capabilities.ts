import { spawn } from 'node:child_process';
import {
  arch,
  cpus,
  freemem,
  hostname,
  loadavg,
  platform,
  release,
  totalmem,
  type,
  uptime,
} from 'node:os';
import packageJson from '../../package.json';
import { COMMIT_RUN_PROTOCOL_VERSIONS } from './devbox-commit-run';
import {
  collectDevboxIsolation,
  type DevboxIsolationSummary,
} from './devbox-isolation';
import { getJudgeReadiness } from './devbox-judge-sandbox';
import {
  getPlaygroundReadiness,
  playgroundEnvironmentCount,
} from './devbox-playground-sandbox';
import { diskCapability, probeVolume } from './storage-headroom';
import { hysteresisThresholds, recordVolumeState } from './storage-hysteresis';

const VERSION_TIMEOUT_MS = 1500;
let staticCapabilitiesPromise: Promise<{
  cli: { name: string; version: string };
  os: {
    arch: string;
    hostname: string;
    platform: NodeJS.Platform;
    release: string;
    type: string;
  };
  runtimes: {
    bun: string | null;
    node: string;
  };
  tools: {
    docker: string | null;
    git: string | null;
  };
}> | null = null;
let judgeReadinessPromise: Promise<
  Awaited<ReturnType<typeof getJudgeReadiness>>
> | null = null;
let judgeReadinessAt = 0;
let readinessSnapshot: {
  judge: Awaited<ReturnType<typeof getJudgeReadiness>>;
  playground: Awaited<ReturnType<typeof getPlaygroundReadiness>>;
} | null = null;
let refreshing: Promise<void> | null = null;
let isolationSnapshot: DevboxIsolationSummary | null = null;
let isolationAt = 0;

// Opt-in until both heartbeat handlers accept these advisory fields; strict
// handlers reject unknown keys and older servers would fail every heartbeat.
async function reportedTrust() {
  if (process.env.TUTURUUU_DEVBOX_REPORT_EXECUTION_MODE !== 'true') return {};
  const mode = process.env.TUTURUUU_DEVBOX_EXECUTION_MODE ?? 'trusted';
  if (!isolationSnapshot || Date.now() - isolationAt > 600_000) {
    isolationSnapshot = (await collectDevboxIsolation()).summary;
    isolationAt = Date.now();
  }
  return {
    ...(['trusted', 'judge-only'].includes(mode)
      ? { executionMode: mode as 'trusted' | 'judge-only' }
      : {}),
    // Only trusted runners execute commit runs; the advertisement ships with
    // the decoder so a runner never claims a protocol it cannot run.
    ...(mode === 'trusted'
      ? { protocols: { commitRun: [...COMMIT_RUN_PROTOCOL_VERSIONS] } }
      : {}),
    isolation: isolationSnapshot,
  };
}

function firstLine(value: string) {
  return value.trim().split(/\r?\n/u)[0]?.trim() || null;
}

async function readCommandVersion(command: string, args: string[]) {
  return new Promise<string | null>((resolveVersion) => {
    let settled = false;
    let output = '';
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveVersion(value);
    };

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(null);
    }, VERSION_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', () => finish(null));
    child.on('exit', (code) => {
      finish(code === 0 ? firstLine(output) : null);
    });
  });
}

async function readStaticCapabilities() {
  const [bunVersion, dockerVersion, gitVersion] = await Promise.all([
    process.versions.bun
      ? Promise.resolve(process.versions.bun)
      : readCommandVersion('bun', ['--version']),
    readCommandVersion('docker', ['--version']),
    readCommandVersion('git', ['--version']),
  ]);

  return {
    cli: {
      name: 'ttr',
      version: packageJson.version,
    },
    os: {
      arch: arch(),
      hostname: hostname(),
      platform: platform(),
      release: release(),
      type: type(),
    },
    runtimes: {
      bun: bunVersion,
      node: process.version,
    },
    tools: {
      docker: dockerVersion,
      git: gitVersion,
    },
  };
}

export async function createDevboxAgentCapabilities() {
  staticCapabilitiesPromise ??= readStaticCapabilities();
  // Existing Judge agents keep their published heartbeat contract. Operators
  // opt a separate pool in only after both heartbeat transports support it.
  const reportPlayground = /^[a-zA-Z0-9_-]{1,40}$/.test(
    process.env.TUTURUUU_PLAYGROUND_POOL_ID ?? ''
  );
  const playgroundReadiness = () =>
    reportPlayground
      ? getPlaygroundReadiness()
      : Promise.resolve({ ready: false, languages: [], environments: 0 });
  if (!readinessSnapshot) {
    judgeReadinessPromise ??= getJudgeReadiness();
    const [judge, playground] = await Promise.all([
      judgeReadinessPromise,
      playgroundReadiness(),
    ]);
    readinessSnapshot = { judge, playground };
    judgeReadinessAt = Date.now();
  } else if (Date.now() - judgeReadinessAt > 600_000 && !refreshing) {
    refreshing = Promise.all([getJudgeReadiness(), playgroundReadiness()])
      .then(([judge, playground]) => {
        readinessSnapshot = { judge, playground };
        judgeReadinessAt = Date.now();
      })
      .catch(() => {
        judgeReadinessAt = Date.now();
      })
      .finally(() => {
        refreshing = null;
      });
  }
  const staticCapabilities = await staticCapabilitiesPromise;
  const { judge, playground } = readinessSnapshot;

  return {
    ...staticCapabilities,
    ...(await reportedTrust()),
    judge,
    ...(reportPlayground
      ? {
          playground: {
            ...playground,
            environments: playgroundEnvironmentCount(),
          },
        }
      : {}),
    reportedAt: new Date().toISOString(),
    resources: {
      cpu: {
        cores: cpus().length,
        model: cpus()[0]?.model ?? null,
      },
      loadAverage: loadavg(),
      memory: {
        freeBytes: freemem(),
        totalBytes: totalmem(),
      },
      uptimeSeconds: uptime(),
      ...(await reportedDisk()),
    },
  };
}

// Bucketed disk headroom (~35 bytes; heartbeat bodies are capped at 4 KiB) so
// offload selection can skip hosts that are about to run out of space.
async function reportedDisk() {
  try {
    return { disk: diskCapability(await probeVolume(storagePath())) };
  } catch {
    return {};
  }
}

// The heartbeat is one of the two automatic reclaim triggers (the other is
// heavy ttr resources admission). A low volume starts one detached
// `ttr storage reclaim --auto` unless this user's cleanup lease is held or the last
// unsuccessful run is inside its cooldown; nothing runs while space is ok.
const storagePath = () =>
  process.env.TUTURUUU_DEVBOX_STORAGE_PATH || process.cwd();

export async function heartbeatStorageTrigger() {
  const volume = await probeVolume(storagePath());
  const state = recordVolumeState(volume, hysteresisThresholds());
  if (state.state !== 'low') return;
  const reclaim = await import('./storage-auto-reclaim.js');
  if (reclaim.heartbeatReclaimDue()) reclaim.spawnHeartbeatReclaim(volume);
}

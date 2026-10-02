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
import { getJudgeReadiness } from './devbox-judge-sandbox';

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
let readinessSnapshot: Awaited<ReturnType<typeof getJudgeReadiness>> | null =
  null;
let refreshing: Promise<void> | null = null;

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
  if (!readinessSnapshot) {
    judgeReadinessPromise ??= getJudgeReadiness();
    readinessSnapshot = await judgeReadinessPromise;
    judgeReadinessAt = Date.now();
  } else if (Date.now() - judgeReadinessAt > 600_000 && !refreshing) {
    refreshing = getJudgeReadiness()
      .then((judge) => {
        readinessSnapshot = judge;
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
  const judge = readinessSnapshot;

  return {
    ...staticCapabilities,
    judge,
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
    },
  };
}

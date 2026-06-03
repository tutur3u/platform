import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import {
  createDevboxSetupPlan,
  type DevboxEnv,
  type DevboxSetupPackageManager,
  type DevboxSetupTool,
  evaluateDevboxCommandPolicy,
  parseDevboxEnvAssignments,
} from '@tuturuuu/devbox';
import type { TuturuuuUserClient } from '../platform';
import type { DevboxRunPayload } from '../platform-devbox';
import { type FlagValue, getFlag } from './args';
import { normalizeBaseUrl } from './config';

const DEFAULT_ONE_OFF_TIMEOUT_SECONDS = 30 * 60;

export function collectRepeatedFlagValues(argv: string[], flagName: string) {
  const values: string[] = [];
  const longFlag = `--${flagName}`;

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--') break;
    if (value === longFlag) {
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        values.push(next);
        index += 1;
      }
      continue;
    }
    if (value?.startsWith(`${longFlag}=`)) {
      values.push(value.slice(longFlag.length + 1));
    }
  }

  return values;
}

export function extractDevboxForwardedCommand(argv: string[]) {
  const separatorIndex = argv.indexOf('--');
  if (separatorIndex >= 0) {
    return argv.slice(separatorIndex + 1).filter(Boolean);
  }

  return argv.slice(2).filter((entry) => !entry.startsWith('--'));
}

export function parseDurationSeconds(value: string | undefined) {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d+)([smh])?$/iu);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]?.toLowerCase() ?? 's';
  if (unit === 'h') return amount * 3600;
  if (unit === 'm') return amount * 60;
  return amount;
}

function parsePreviewPorts(value: string | undefined) {
  return value
    ? value
        .split(',')
        .map((entry) => Number.parseInt(entry.trim(), 10))
        .filter((port) => Number.isFinite(port) && port > 0)
    : [];
}

function parseEnvFiles(flags: Record<string, FlagValue>) {
  return getFlag(flags, 'env-file')
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function createDevboxRunPayload({
  argv,
  flags,
}: {
  argv: string[];
  flags: Record<string, FlagValue>;
}): DevboxRunPayload {
  const command = extractDevboxForwardedCommand(argv);
  if (command.length === 0) {
    throw new Error('Missing remote command. Use `ttr box run -- <command>`.');
  }

  const policy = evaluateDevboxCommandPolicy(command);
  if (!policy.allowed) {
    throw new Error(policy.reason);
  }

  const leaseId = getFlag(flags, 'lease');
  const envAssignments = collectRepeatedFlagValues(argv, 'env');
  const env: DevboxEnv | undefined =
    envAssignments.length > 0
      ? parseDevboxEnvAssignments(envAssignments)
      : undefined;

  return {
    command,
    ...(env ? { env } : {}),
    envFiles: parseEnvFiles(flags),
    keep: flags.keep === true,
    leaseMode: leaseId ? 'existing' : 'auto',
    ...(leaseId ? { leaseId } : {}),
    previewPorts: parsePreviewPorts(getFlag(flags, 'preview-port')),
    reuse: flags.reuse === true,
    runnerId: getFlag(flags, 'runner'),
    timeoutSeconds:
      parseDurationSeconds(getFlag(flags, 'timeout')) ??
      DEFAULT_ONE_OFF_TIMEOUT_SECONDS,
  };
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printDevboxRun(
  response: Awaited<ReturnType<TuturuuuUserClient['devboxes']['createRun']>>
) {
  process.stdout.write(
    `Devbox run ${response.run.id} ${response.run.status}${
      response.lease?.id ? ` on lease ${response.lease.id}` : ''
    }.\n`
  );
  for (const line of response.logs ?? []) {
    process.stdout.write(`${line}\n`);
  }
}

async function createDoctorReport() {
  const tools = {
    bun: getToolVersion('bun', ['--version']),
    docker: getToolVersion('docker', ['--version']),
    git: getToolVersion('git', ['--version']),
    node: getToolVersion('node', ['--version']) ?? process.versions.node,
  };
  const missingTools = Object.entries(tools)
    .filter(([, version]) => !version)
    .map(([tool]) => tool as DevboxSetupTool);
  const packageManager = detectPackageManager();
  const setupPlan =
    missingTools.length > 0 && packageManager
      ? createDevboxSetupPlan({
          missingTools,
          packageManager,
          platform: platform(),
        })
      : null;

  return {
    containerized: true,
    missingTools,
    packageManager,
    setupCommands: setupPlan?.commands ?? [],
    status: missingTools.length > 0 ? 'needs-setup' : 'ok',
    tools,
  };
}

function getToolVersion(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split('\n')[0]?.trim() || null;
}

function commandExists(command: string) {
  return (
    spawnSync(command, ['--version'], {
      encoding: 'utf8',
      shell: false,
    }).status === 0
  );
}

function detectPackageManager(): DevboxSetupPackageManager | null {
  const currentPlatform = platform();

  if (currentPlatform === 'darwin' && commandExists('brew')) return 'brew';
  if (currentPlatform === 'win32' && commandExists('winget')) return 'winget';

  for (const candidate of ['apt-get', 'dnf', 'pacman'] as const) {
    if (commandExists(candidate)) return candidate;
  }

  return null;
}

function runInstallerCommand(command: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      shell: false,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.join(' ')} exited with ${code}`));
    });
  });
}

export async function runDevboxCommand({
  action,
  argv,
  baseUrl,
  client,
  flags,
  json,
}: {
  action?: string;
  argv: string[];
  baseUrl?: string;
  client?: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  const resolvedAction = action || 'list';

  if (resolvedAction === 'doctor' || resolvedAction === 'setup') {
    const report = await createDoctorReport();
    if (json) {
      printJson(report);
      return;
    }
    if (resolvedAction === 'setup' && report.setupCommands.length > 0) {
      process.stdout.write(
        `${[
          'Devbox setup plan',
          `Package manager: ${report.packageManager ?? 'not detected'}`,
          ...report.setupCommands.map((command) => `  ${command.join(' ')}`),
        ].join('\n')}\n`
      );

      if (flags.yes === true) {
        for (const command of report.setupCommands) {
          await runInstallerCommand(command);
        }
      }
      return;
    }

    process.stdout.write(
      `${[
        'Devbox doctor',
        `Node.js: ${report.tools.node ?? 'missing'}`,
        `Bun: ${report.tools.bun ?? 'missing'}`,
        `Docker: ${report.tools.docker ?? 'missing'}`,
        `Git: ${report.tools.git ?? 'missing'}`,
        'Execution: containerized',
      ].join('\n')}\n`
    );
    return;
  }

  if (resolvedAction === 'agent' && argv[2] === 'start') {
    await runDevboxAgentLoop({
      baseUrl,
      once: flags.once === true,
      token:
        getFlag(flags, 'token') || process.env.TUTURUUU_DEVBOX_RUNNER_TOKEN,
    });
    return;
  }

  if (!client) {
    throw new Error('Not logged in. Run `ttr login` first.');
  }

  if (resolvedAction === 'run') {
    const response = await client.devboxes.createRun(
      createDevboxRunPayload({ argv, flags })
    );
    if (json) {
      printJson(response);
      return;
    }
    printDevboxRun(response);
    if (typeof response.run.exitCode === 'number') {
      process.exitCode = response.run.exitCode;
    }
    return;
  }

  if (resolvedAction === 'lease') {
    const response = await client.devboxes.createLease({
      profile: getFlag(flags, 'profile'),
      runnerId: getFlag(flags, 'runner'),
      ttlSeconds: parseDurationSeconds(getFlag(flags, 'ttl')),
    });
    if (json) printJson(response);
    else process.stdout.write(`Devbox lease ${response.lease.id} ready.\n`);
    return;
  }

  if (resolvedAction === 'release') {
    const leaseId = argv[2];
    if (!leaseId) throw new Error('Missing lease id.');
    const response = await client.devboxes.releaseLease(leaseId);
    if (json) printJson(response);
    else process.stdout.write(`${response.message}\n`);
    return;
  }

  if (resolvedAction === 'preview') {
    const leaseId = getFlag(flags, 'lease');
    const port = Number.parseInt(getFlag(flags, 'port') ?? '', 10);
    if (!leaseId || !Number.isFinite(port)) {
      throw new Error('Preview requires --lease <id> and --port <port>.');
    }
    const response = await client.devboxes.createPreview({ leaseId, port });
    if (json) printJson(response);
    else process.stdout.write(`${response.url}\n`);
    return;
  }

  if (resolvedAction === 'logs') {
    const runId = argv[2];
    if (!runId) throw new Error('Missing run id.');
    const response = await client.devboxes.getRunLogs(runId);
    if (json) printJson(response);
    else process.stdout.write(`${response.logs.join('\n')}\n`);
    return;
  }

  if (resolvedAction === 'stop') {
    const runId = argv[2];
    if (!runId) throw new Error('Missing run id.');
    const response = await client.devboxes.stopRun(runId);
    if (json) printJson(response);
    else process.stdout.write(`${response.message}\n`);
    return;
  }

  if (resolvedAction === 'agent' && argv[2] === 'register') {
    const response = await client.devboxes.registerAgent({
      name: getFlag(flags, 'name') ?? 'Tuturuuu devbox runner',
    });
    if (json) printJson(response);
    else {
      process.stdout.write(
        `Runner ${response.runner.name} registered.\nToken: ${response.token}\n`
      );
    }
    return;
  }

  if (resolvedAction === 'env') {
    const leaseId = getFlag(flags, 'lease');
    if (!leaseId) throw new Error('Env commands require --lease <id>.');
    const envAction = argv[2];

    if (envAction === 'set') {
      const updates = parseDevboxEnvAssignments(
        argv.slice(3).filter((entry) => entry.includes('='))
      );
      const response = await client.devboxes.updateEnv({ leaseId, updates });
      if (json) printJson(response);
      else process.stdout.write(`Env revision ${response.revision} stored.\n`);
      return;
    }

    if (envAction === 'unset') {
      const removals = argv
        .slice(3)
        .filter((entry) => !entry.startsWith('--') && !entry.includes('='));
      const response = await client.devboxes.updateEnv({ leaseId, removals });
      if (json) printJson(response);
      else process.stdout.write(`Env revision ${response.revision} stored.\n`);
      return;
    }

    throw new Error('Unsupported env command. Use set or unset.');
  }

  if (resolvedAction === 'cache') {
    if (argv[2] === 'prune') {
      const response = await client.devboxes.pruneCache();
      if (json) printJson(response);
      else process.stdout.write(`${response.message}\n`);
      return;
    }
    const response = await client.devboxes.getCache();
    if (json) printJson(response);
    else process.stdout.write(`${JSON.stringify(response.caches, null, 2)}\n`);
    return;
  }

  if (resolvedAction === 'list') {
    const response = await client.devboxes.listRuns();
    if (json) printJson(response);
    else process.stdout.write(`${JSON.stringify(response.runs, null, 2)}\n`);
    return;
  }

  throw new Error(`Unsupported devbox command: ${resolvedAction}`);
}

async function runDevboxAgentLoop({
  baseUrl,
  once,
  token,
}: {
  baseUrl?: string;
  once?: boolean;
  token?: string;
}) {
  if (!token) {
    throw new Error(
      'Missing runner token. Use --token or TUTURUUU_DEVBOX_RUNNER_TOKEN.'
    );
  }

  const origin = normalizeBaseUrl(baseUrl);
  const headers = {
    'X-Devbox-Runner-Token': token,
  };

  process.stdout.write('Starting Tuturuuu devbox agent.\n');

  let running = true;
  while (running) {
    await fetch(new URL('/api/v1/devboxes/agents/heartbeat', origin), {
      headers,
      method: 'POST',
    });
    const pollResponse = await fetch(
      new URL('/api/v1/devboxes/agents/poll', origin),
      {
        headers,
      }
    );
    const payload = (await pollResponse.json().catch(() => ({ jobs: [] }))) as {
      jobs?: unknown[];
    };

    if (payload.jobs?.length) {
      process.stdout.write(
        `Received ${payload.jobs.length} devbox job(s); execution support is handled by the runner runtime.\n`
      );
    }

    if (once) {
      running = false;
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

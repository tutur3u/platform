import {
  type DevboxEnv,
  evaluateDevboxCommandPolicy,
  parseDevboxEnvAssignments,
} from '@tuturuuu/devbox';
import type { TuturuuuUserClient } from '../platform';
import type { DevboxRunPayload, DevboxRunResponse } from '../platform-devbox';
import { type FlagValue, getFlag } from './args';
import { runDevboxAgentLoop } from './devbox-agent';
import {
  createDevboxDoctorReport,
  printDevboxDoctorReport,
} from './devbox-doctor';
import { runDevboxSetupCommand } from './devbox-setup';

const DEFAULT_ONE_OFF_TIMEOUT_SECONDS = 30 * 60;
const DEFAULT_UPGRADE_TIMEOUT_SECONDS = 10 * 60;
const DEFAULT_WEB_CWD = 'apps/web';
const DEFAULT_WEB_PORT = 7803;
const DEFAULT_CLOUDFLARED_IMAGE = 'cloudflare/cloudflared:latest';
const DEVBOX_RUN_POLL_INTERVAL_MS = 1000;
const DEVBOX_RUN_POLL_GRACE_MS = 30_000;

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

function shellQuote(value: string) {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function parsePositiveIntegerFlag({
  defaultValue,
  flagName,
  value,
}: {
  defaultValue: number;
  flagName: string;
  value: string | undefined;
}) {
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${flagName} value: ${value}`);
  }

  return parsed;
}

function getRequiredEnvironmentValue({
  flagName,
  name,
  targetName,
}: {
  flagName: string;
  name: string;
  targetName: string;
}) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name} for --${flagName}. Set it locally before queueing the devbox run.`
    );
  }

  return { [targetName]: value };
}

function collectDevboxEnv({
  argv,
  flags,
  requireCloudflaredToken = false,
}: {
  argv: string[];
  flags: Record<string, FlagValue>;
  requireCloudflaredToken?: boolean;
}) {
  const envAssignments = collectRepeatedFlagValues(argv, 'env');
  const env: DevboxEnv =
    envAssignments.length > 0 ? parseDevboxEnvAssignments(envAssignments) : {};
  const databaseUrl = getFlag(flags, 'database-url');
  const databaseUrlEnv = getFlag(flags, 'database-url-env');
  if (databaseUrl && databaseUrlEnv) {
    throw new Error(
      'Use either --database-url or --database-url-env, not both.'
    );
  }

  if (databaseUrlEnv) {
    Object.assign(
      env,
      getRequiredEnvironmentValue({
        flagName: 'database-url-env',
        name: databaseUrlEnv,
        targetName: 'DATABASE_URL',
      })
    );
  } else if (databaseUrl) {
    env.DATABASE_URL = databaseUrl;
  }

  const cloudflaredTokenEnv =
    getFlag(flags, 'cloudflared-token-env') ?? getFlag(flags, 'token-env');
  if (requireCloudflaredToken || cloudflaredTokenEnv) {
    if (!cloudflaredTokenEnv) {
      throw new Error(
        'Cloudflared tunnel runs require --cloudflared-token-env <env>.'
      );
    }
    Object.assign(
      env,
      getRequiredEnvironmentValue({
        flagName: 'cloudflared-token-env',
        name: cloudflaredTokenEnv,
        targetName: 'CLOUDFLARED_TOKEN',
      })
    );
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

function createDevboxCommandPayload({
  command,
  defaultKeep = false,
  defaultPreviewPorts = [],
  defaultTimeoutSeconds,
  env,
  flags,
}: {
  command: string[];
  defaultKeep?: boolean;
  defaultPreviewPorts?: number[];
  defaultTimeoutSeconds?: number;
  env?: DevboxEnv;
  flags: Record<string, FlagValue>;
}): DevboxRunPayload {
  const policy = evaluateDevboxCommandPolicy(command);
  if (!policy.allowed) {
    throw new Error(policy.reason);
  }

  const leaseId = getFlag(flags, 'lease');
  const previewPorts = parsePreviewPorts(getFlag(flags, 'preview-port'));
  const timeoutSeconds =
    parseDurationSeconds(getFlag(flags, 'timeout')) ?? defaultTimeoutSeconds;

  return {
    command,
    ...(env ? { env } : {}),
    envFiles: parseEnvFiles(flags),
    keep: flags.keep === true || defaultKeep,
    leaseMode: leaseId ? 'existing' : 'auto',
    ...(leaseId ? { leaseId } : {}),
    previewPorts: previewPorts.length > 0 ? previewPorts : defaultPreviewPorts,
    reuse: flags.reuse === true,
    runnerId: getFlag(flags, 'runner'),
    ...(timeoutSeconds ? { timeoutSeconds } : {}),
  };
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

  const env = collectDevboxEnv({ argv, flags });
  return createDevboxCommandPayload({
    command,
    defaultTimeoutSeconds: DEFAULT_ONE_OFF_TIMEOUT_SECONDS,
    env,
    flags,
  });
}

function createBuildCommand(flags: Record<string, FlagValue>) {
  const cwd = getFlag(flags, 'cwd');
  const buildCommand = getFlag(flags, 'build-command');

  if (buildCommand) return ['bash', '-c', buildCommand];
  if (cwd) return ['bun', 'run', '--cwd', cwd, 'build'];
  return ['bun', 'run', 'build'];
}

export function createDevboxBuildPayload({
  argv,
  flags,
}: {
  argv: string[];
  flags: Record<string, FlagValue>;
}): DevboxRunPayload {
  return createDevboxCommandPayload({
    command: createBuildCommand(flags),
    env: collectDevboxEnv({ argv, flags }),
    flags,
  });
}

function createCloudflaredDockerCommand(flags: Record<string, FlagValue>) {
  const image =
    getFlag(flags, 'cloudflared-image') ?? DEFAULT_CLOUDFLARED_IMAGE;
  return `docker run --rm --network host ${shellQuote(
    image
  )} tunnel run --token "$CLOUDFLARED_TOKEN"`;
}

function createServeScript(flags: Record<string, FlagValue>) {
  const cwd = getFlag(flags, 'cwd') ?? DEFAULT_WEB_CWD;
  const port = parsePositiveIntegerFlag({
    defaultValue: DEFAULT_WEB_PORT,
    flagName: 'port',
    value: getFlag(flags, 'port'),
  });
  const buildCommand =
    flags['no-build'] === true
      ? undefined
      : (getFlag(flags, 'build-command') ??
        `bun run --cwd ${shellQuote(cwd)} build`);
  const serveCommand =
    getFlag(flags, 'serve-command') ??
    `PORT=${port} bun run --cwd ${shellQuote(cwd)} start:app`;
  const cloudflaredCommand =
    flags.cloudflared === true ||
    getFlag(flags, 'cloudflared-token-env') ||
    getFlag(flags, 'token-env')
      ? createCloudflaredDockerCommand(flags)
      : undefined;
  const lines = [
    'set -euo pipefail',
    buildCommand,
    `${serveCommand} &`,
    'APP_PID=$!',
    'cleanup() {',
    `  kill "$APP_PID" "\${TUNNEL_PID:-}" 2>/dev/null || true`,
    '}',
    'trap cleanup INT TERM EXIT',
    cloudflaredCommand ? `${cloudflaredCommand} &` : undefined,
    cloudflaredCommand ? 'TUNNEL_PID=$!' : undefined,
    cloudflaredCommand ? 'wait -n "$APP_PID" "$TUNNEL_PID"' : 'wait "$APP_PID"',
  ].filter(Boolean);

  return {
    command: ['bash', '-c', lines.join('\n')],
    port,
    usesCloudflared: Boolean(cloudflaredCommand),
  };
}

export function createDevboxServePayload({
  argv,
  flags,
}: {
  argv: string[];
  flags: Record<string, FlagValue>;
}): DevboxRunPayload {
  const serve = createServeScript(flags);
  return createDevboxCommandPayload({
    command: serve.command,
    defaultKeep: true,
    defaultPreviewPorts: [serve.port],
    env: collectDevboxEnv({
      argv,
      flags,
      requireCloudflaredToken: serve.usesCloudflared,
    }),
    flags,
  });
}

export function createDevboxTunnelPayload({
  argv,
  flags,
}: {
  argv: string[];
  flags: Record<string, FlagValue>;
}): DevboxRunPayload {
  return createDevboxCommandPayload({
    command: ['bash', '-c', createCloudflaredDockerCommand(flags)],
    defaultKeep: true,
    env: collectDevboxEnv({
      argv,
      flags,
      requireCloudflaredToken: true,
    }),
    flags,
  });
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

function isTerminalRunStatus(status: string) {
  return ['cancelled', 'failed', 'succeeded'].includes(status);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevboxRun({
  client,
  initial,
  timeoutSeconds,
}: {
  client: TuturuuuUserClient;
  initial: DevboxRunResponse;
  timeoutSeconds?: number;
}) {
  const deadline =
    typeof timeoutSeconds === 'number'
      ? Date.now() + timeoutSeconds * 1000 + DEVBOX_RUN_POLL_GRACE_MS
      : undefined;
  let latest = initial;

  while (!isTerminalRunStatus(latest.run.status)) {
    if (deadline && Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for devbox run ${initial.run.id} to finish.`
      );
    }

    await sleep(DEVBOX_RUN_POLL_INTERVAL_MS);
    latest = await client.devboxes.getRun(initial.run.id);
  }

  return latest;
}

function createDevboxUpgradePayload(flags: Record<string, FlagValue>) {
  return {
    command: ['bun', 'i', '-g', 'tuturuuu'],
    keep: false,
    leaseMode: 'auto' as const,
    runnerId: getFlag(flags, 'runner'),
    timeoutSeconds:
      parseDurationSeconds(getFlag(flags, 'timeout')) ??
      DEFAULT_UPGRADE_TIMEOUT_SECONDS,
  };
}

async function createAndPrintDevboxRun({
  client,
  json,
  payload,
  wait = true,
}: {
  client: TuturuuuUserClient;
  json: boolean;
  payload: DevboxRunPayload;
  wait?: boolean;
}) {
  const initial = await client.devboxes.createRun(payload);
  if (!wait) {
    if (json) {
      printJson(initial);
      return;
    }
    printDevboxRun(initial);
    process.stdout.write(`Use \`ttr box logs ${initial.run.id}\` for logs.\n`);
    process.stdout.write(
      `Use \`ttr box stop ${initial.run.id}\` to stop it.\n`
    );
    const firstPreviewPort = payload.previewPorts?.[0];
    if (initial.lease?.id && firstPreviewPort) {
      process.stdout.write(
        `Use \`ttr box preview --lease ${initial.lease.id} --port ${firstPreviewPort}\` for the authenticated preview.\n`
      );
    }
    return;
  }

  const response = await waitForDevboxRun({
    client,
    initial,
    timeoutSeconds: payload.timeoutSeconds,
  });
  if (json) {
    printJson(response);
    return;
  }
  printDevboxRun(response);
  if (typeof response.run.exitCode === 'number') {
    process.exitCode = response.run.exitCode;
  }
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

  if (resolvedAction === 'doctor') {
    printDevboxDoctorReport(await createDevboxDoctorReport(), json);
    return;
  }

  if (resolvedAction === 'setup') {
    await runDevboxSetupCommand({ client, flags, json });
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
    const payload = createDevboxRunPayload({ argv, flags });
    await createAndPrintDevboxRun({ client, json, payload });
    return;
  }

  if (resolvedAction === 'build') {
    const payload = createDevboxBuildPayload({ argv, flags });
    await createAndPrintDevboxRun({ client, json, payload });
    return;
  }

  if (resolvedAction === 'serve') {
    const payload = createDevboxServePayload({ argv, flags });
    await createAndPrintDevboxRun({
      client,
      json,
      payload,
      wait: flags.wait === true,
    });
    return;
  }

  if (resolvedAction === 'tunnel') {
    const payload = createDevboxTunnelPayload({ argv, flags });
    await createAndPrintDevboxRun({
      client,
      json,
      payload,
      wait: flags.wait === true,
    });
    return;
  }

  if (resolvedAction === 'upgrade') {
    const payload = createDevboxUpgradePayload(flags);
    await createAndPrintDevboxRun({ client, json, payload });
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

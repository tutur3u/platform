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
    Date.now() +
    (timeoutSeconds ?? DEFAULT_ONE_OFF_TIMEOUT_SECONDS) * 1000 +
    DEVBOX_RUN_POLL_GRACE_MS;
  let latest = initial;

  while (!isTerminalRunStatus(latest.run.status)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for devbox run ${initial.run.id} to finish.`
      );
    }

    await sleep(DEVBOX_RUN_POLL_INTERVAL_MS);
    latest = await client.devboxes.getRun(initial.run.id);
  }

  return latest;
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
    await runDevboxSetupCommand({ flags, json });
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
    const response = await waitForDevboxRun({
      client,
      initial: await client.devboxes.createRun(payload),
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

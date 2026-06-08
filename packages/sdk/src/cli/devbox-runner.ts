import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateDevboxCommandPolicy,
  parseDevboxEnvAssignments,
  redactDevboxSecrets,
} from '@tuturuuu/devbox';
import {
  type DevboxAgentJob,
  recordDevboxAgentEvents,
} from '../platform-devbox';

type DevboxAgentCompletionStatus = 'cancelled' | 'failed' | 'succeeded';

export interface DevboxAgentExecutionOptions {
  baseUrl: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  token: string;
}

function formatResponseStatus(response: Response) {
  return `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
}

async function postAgentEvents({
  baseUrl,
  events,
  fetch,
  runId,
  token,
}: DevboxAgentExecutionOptions & {
  events: { eventType?: string; message?: string }[];
  runId: string;
}) {
  if (events.length === 0) return;

  const response = await recordDevboxAgentEvents({
    baseUrl,
    fetch,
    payload: {
      events,
      runId,
    },
    token,
  });
  if (!response.ok) {
    throw new Error(
      `Devbox agent event upload failed: ${formatResponseStatus(response)}`
    );
  }
}

async function postAgentCompletion({
  baseUrl,
  exitCode,
  fetch,
  runId,
  status,
  token,
}: DevboxAgentExecutionOptions & {
  exitCode: number;
  runId: string;
  status: DevboxAgentCompletionStatus;
}) {
  const response = await recordDevboxAgentEvents({
    baseUrl,
    fetch,
    payload: {
      completion: {
        exitCode,
        status,
      },
      runId,
    },
    token,
  });
  if (!response.ok) {
    throw new Error(
      `Devbox agent completion upload failed: ${formatResponseStatus(response)}`
    );
  }
}

function parseEnvFile(raw: string) {
  return parseDevboxEnvAssignments(
    raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  );
}

async function readEnvFiles(files: string[], cwd: string) {
  let env: Record<string, string> = {};

  for (const file of files) {
    const raw = await readFile(resolve(cwd, file), 'utf8');
    env = {
      ...env,
      ...parseEnvFile(raw),
    };
  }

  return env;
}

function getExitCode(code: number | null, signal: NodeJS.Signals | null) {
  if (typeof code === 'number') return code;
  return signal ? 128 : 1;
}

export async function executeDevboxAgentJob(
  job: DevboxAgentJob,
  options: DevboxAgentExecutionOptions
) {
  const cwd = options.cwd ?? process.cwd();
  const command = job.command.filter(Boolean);
  const policy = evaluateDevboxCommandPolicy(command);
  const envFromFiles = await readEnvFiles(job.envFiles ?? [], cwd);
  const jobEnv = {
    ...envFromFiles,
    ...(job.env ?? {}),
  };
  const eventOptions = {
    ...options,
    cwd,
    runId: job.runId,
  };

  await postAgentEvents({
    ...eventOptions,
    events: [{ message: `remote$ ${command.join(' ')}` }],
  });

  if (!policy.allowed) {
    const message = policy.reason ?? 'Command is blocked in devboxes.';
    await postAgentEvents({
      ...eventOptions,
      events: [{ eventType: 'error', message }],
    });
    await postAgentCompletion({
      ...eventOptions,
      exitCode: 126,
      status: 'failed',
    });
    return { exitCode: 126, status: 'failed' as const };
  }

  const child = spawn(command[0]!, command.slice(1), {
    cwd,
    env: {
      ...(options.env ?? process.env),
      ...jobEnv,
    },
    shell: false,
  });
  let timedOut = false;
  const timeoutMs = job.timeoutSeconds
    ? Math.max(1, job.timeoutSeconds) * 1000
    : undefined;
  const timeout =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs);

  const logUploads: Promise<void>[] = [];
  const recordLog = async (message: string) => {
    await postAgentEvents({
      ...eventOptions,
      events: [{ message: redactDevboxSecrets(message, jobEnv) }],
    });
  };

  child.stdout.on('data', (chunk) => {
    logUploads.push(recordLog(String(chunk)));
  });
  child.stderr.on('data', (chunk) => {
    logUploads.push(recordLog(String(chunk)));
  });

  const exit = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveExit, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => resolveExit({ code, signal }));
  }).finally(() => {
    if (timeout) clearTimeout(timeout);
  });

  const exitCode = timedOut ? 124 : getExitCode(exit.code, exit.signal);
  const status: DevboxAgentCompletionStatus =
    exitCode === 0 ? 'succeeded' : 'failed';

  if (timedOut) {
    logUploads.push(
      recordLog(`Command timed out after ${job.timeoutSeconds}s.`)
    );
  }

  await Promise.all(logUploads);

  await postAgentCompletion({
    ...eventOptions,
    exitCode,
    status,
  });

  return { exitCode, status };
}

import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  evaluateDevboxCommandPolicy,
  parseDevboxEnvAssignments,
  redactDevboxSecrets,
} from '@tuturuuu/devbox';
import { devboxRunCancelRequested } from '@tuturuuu/devbox/actor';
import {
  type DevboxAgentJob,
  recordDevboxAgentEvents,
} from '../platform-devbox';
import { agentRequest, withAgentRetries } from './devbox-agent-network';
import {
  COMMIT_RUN_ENVELOPE,
  decodeCommitRun,
  getCommitRunStateDir,
  prepareCommitWorktree,
} from './devbox-commit-run';
import { runProcessGroup } from './devbox-job-process';
import {
  parseJudgeImages,
  parseJudgePayload,
  parseJudgeResourceLimits,
  runJudgeCases,
} from './devbox-judge-sandbox';
import { runPlaygroundJob } from './devbox-playground-sandbox';

type DevboxAgentCompletionStatus = 'cancelled' | 'failed' | 'succeeded';

export interface DevboxAgentExecutionOptions {
  baseUrl: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  token: string;
  // Aborted when the agent must stop active jobs (second stop signal).
  cancelSignal?: AbortSignal;
  cancelCheckMs?: number;
  killGraceMs?: number;
}

const DEVBOX_CHILD_BASE_ENV_KEYS = [
  'BUN_INSTALL',
  'CI',
  'FORCE_COLOR',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LOGNAME',
  'NODE_EXTRA_CA_CERTS',
  'NO_COLOR',
  'NO_PROXY',
  'PATH',
  'SHELL',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'USER',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'http_proxy',
  'https_proxy',
  'no_proxy',
] as const;

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

  const response = await withAgentRetries(() =>
    agentRequest('Devbox agent event upload', () =>
      recordDevboxAgentEvents({
        baseUrl,
        fetch,
        payload: {
          events,
          runId,
        },
        token,
      })
    )
  );
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
  // A retry after a lost response finds the run already finished; the
  // completion RPC then reports 404, which is success for a replay.
  let attempts = 0;
  const response = await withAgentRetries(() =>
    agentRequest('Devbox agent completion upload', () => {
      attempts += 1;
      return recordDevboxAgentEvents({
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
    })
  );
  if (response.status === 404 && attempts > 1) return;
  if (!response.ok) {
    throw new Error(
      `Devbox agent completion upload failed: ${formatResponseStatus(response)}`
    );
  }
}

async function readRunCancelRequested(
  { baseUrl, fetch, token }: DevboxAgentExecutionOptions,
  runId: string
) {
  const response = await recordDevboxAgentEvents({
    baseUrl,
    fetch,
    payload: { runId },
    token,
  });
  return devboxRunCancelRequested(response);
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

function createDevboxChildBaseEnv(source: NodeJS.ProcessEnv) {
  const env: NodeJS.ProcessEnv = {};

  for (const key of DEVBOX_CHILD_BASE_ENV_KEYS) {
    const value = source[key];
    if (typeof value === 'string') env[key] = value;
  }

  if (!env.PATH && typeof process.env.PATH === 'string') {
    env.PATH = process.env.PATH;
  }
  if (!env.HOME && typeof process.env.HOME === 'string') {
    env.HOME = process.env.HOME;
  }

  return env;
}

export async function executeDevboxAgentJob(
  job: DevboxAgentJob,
  options: DevboxAgentExecutionOptions
) {
  const cwd = options.cwd ?? process.cwd();
  const command = job.command.filter(Boolean);
  const eventOptions = { ...options, cwd, runId: job.runId };

  const executionMode =
    (options.env ?? process.env).TUTURUUU_DEVBOX_EXECUTION_MODE ?? 'trusted';
  const maintenance =
    (command.length === 1 && command[0] === '__ttr_restart_agent_v1__') ||
    (command.length === 4 && command.join(' ') === 'bun i -g tuturuuu');
  // Trust tiers stay separate on the runner too: a trusted host (with its
  // credentials) never executes untrusted Judge code, and a playground pool
  // process accepts only playground envelopes. Server-side feature exclusion
  // is the primary control; this is the local fence.
  const playgroundPool = Boolean(
    (options.env ?? process.env).TUTURUUU_PLAYGROUND_POOL_ID
  );
  const trustedFenceRejects =
    executionMode === 'trusted' &&
    !maintenance &&
    (command[0] === '__ttr_judge_v1__' ||
      (playgroundPool
        ? command[0] !== '__ttr_playground_v1__'
        : command[0] === '__ttr_playground_v1__'));
  if (
    !['trusted', 'judge-only'].includes(executionMode) ||
    trustedFenceRejects ||
    (executionMode === 'judge-only' &&
      (job.envFiles?.length ||
        (!maintenance && command[0] !== '__ttr_judge_v1__') ||
        (maintenance && Object.keys(job.env ?? {}).length > 0)))
  ) {
    // A trusted runner refusing a Judge or playground envelope means the
    // server routed untrusted work to a credentialed host. Keep that distinct
    // so operators can audit for it before trusted-mode rollout.
    const fenceKind =
      trustedFenceRejects && command[0] === '__ttr_judge_v1__'
        ? 'judge'
        : trustedFenceRejects && command[0] === '__ttr_playground_v1__'
          ? 'playground'
          : undefined;
    if (fenceKind)
      console.warn(
        `[devbox] trusted_runner_fence: refused a ${fenceKind} envelope for run ${job.runId}`
      );
    await postAgentEvents({
      ...eventOptions,
      events: [
        {
          eventType: 'error',
          message: fenceKind
            ? `Host execution policy rejected this job: trusted_runner_fence refused a ${fenceKind} envelope on a trusted runner.`
            : 'Host execution policy rejected this job.',
        },
      ],
    });
    await postAgentCompletion({
      ...eventOptions,
      exitCode: 1,
      status: 'failed',
    });
    return { exitCode: 1, status: 'failed' as const };
  }

  if (command[0] === COMMIT_RUN_ENVELOPE) {
    // Trusted runners only: judge-only and playground pools reject this
    // envelope above. The inner argv goes back through the same policy.
    let spec: ReturnType<typeof decodeCommitRun>;
    let prepared: Awaited<ReturnType<typeof prepareCommitWorktree>>;
    let runCwd: string;
    try {
      spec = decodeCommitRun(command);
      // Refuse a blocked inner command before any fetch or checkout work.
      const innerPolicy = evaluateDevboxCommandPolicy(spec.command);
      if (!innerPolicy.allowed)
        throw new Error(
          innerPolicy.reason ?? 'Command is blocked in devboxes.'
        );
      prepared = await prepareCommitWorktree({
        checkout: cwd,
        sha: spec.sha,
        runId: job.runId,
        stateDir: getCommitRunStateDir(options.env ?? process.env),
      });
      runCwd = join(prepared.path, spec.prefix);
      if (!(await stat(runCwd).catch(() => undefined))?.isDirectory()) {
        await prepared.cleanup();
        throw new Error(
          `Directory ${spec.prefix || '.'} does not exist at that commit.`
        );
      }
    } catch (error) {
      await postAgentEvents({
        ...eventOptions,
        events: [
          {
            eventType: 'error',
            message:
              error instanceof Error ? error.message : 'Commit run failed.',
          },
        ],
      });
      await postAgentCompletion({
        ...eventOptions,
        exitCode: 1,
        status: 'failed',
      });
      return { exitCode: 1, status: 'failed' as const };
    }
    await postAgentEvents({
      ...eventOptions,
      events: [{ message: `remote$ checkout ${spec.sha.slice(0, 12)}` }],
    });
    try {
      return await executeDevboxAgentJob(
        { ...job, command: spec.command },
        { ...options, cwd: runCwd }
      );
    } finally {
      await prepared.cleanup();
    }
  }

  if (command.length === 1 && command[0] === '__ttr_restart_agent_v1__') {
    await postAgentCompletion({
      ...eventOptions,
      exitCode: 0,
      status: 'succeeded',
    });
    return { exitCode: 0, status: 'succeeded' as const };
  }

  if (command[0] === '__ttr_playground_v1__') {
    try {
      if (
        command.length !== 2 ||
        job.envFiles?.length ||
        !job.env?.__TTR_RESOURCE_LIMITS
      )
        throw new Error('Invalid playground envelope');
      const result = await runPlaygroundJob(
        command[1]!,
        parseJudgeResourceLimits(job.env.__TTR_RESOURCE_LIMITS),
        async (delta) => {
          const response = await (options.fetch ?? fetch)(
            new URL(
              '/api/v1/devboxes/agents/playground-files',
              options.baseUrl
            ),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Devbox-Runner-Token': options.token,
              },
              body: JSON.stringify({ runId: job.runId, ...delta }),
              signal: AbortSignal.timeout(30_000),
            }
          );
          if (!response.ok) throw new Error('Drive save failed');
        }
      );
      await postAgentEvents({
        ...eventOptions,
        events: [
          {
            eventType: result.preview
              ? 'playground_preview'
              : 'playground_output',
            message: result.preview ?? result.output,
          },
        ],
      });
      const status =
        result.code === 0 ? ('succeeded' as const) : ('failed' as const);
      await postAgentCompletion({
        ...eventOptions,
        exitCode: result.code,
        status,
      });
      return { exitCode: result.code, status };
    } catch {
      await postAgentEvents({
        ...eventOptions,
        events: [
          {
            eventType: 'error',
            message:
              'Playground execution or Drive save failed. Check runner capacity and try again.',
          },
        ],
      });
      await postAgentCompletion({
        ...eventOptions,
        exitCode: 1,
        status: 'failed',
      });
      return { exitCode: 1, status: 'failed' as const };
    }
  }

  if (command[0] === '__ttr_judge_v1__') {
    try {
      if (command.length !== 2 || job.envFiles?.length) {
        throw new Error('Invalid Judge job envelope.');
      }
      const rawLimits = job.env?.__TTR_RESOURCE_LIMITS;
      const images = parseJudgeImages(
        (options.env ?? process.env).TUTURUUU_JUDGE_IMAGES
      );
      if (!rawLimits) {
        throw new Error('Judge runner is missing its resource limits.');
      }
      const result = await runJudgeCases({
        images,
        limits: parseJudgeResourceLimits(rawLimits),
        payload: parseJudgePayload(command[1]!),
      });
      await postAgentEvents({
        ...eventOptions,
        events: [
          {
            eventType: 'judge_result',
            message: JSON.stringify({
              passed: result.passed,
              results: result.results,
              total: result.results.length,
            }),
          },
        ],
      });
      await postAgentCompletion({
        ...eventOptions,
        exitCode: 0,
        status: 'succeeded',
      });
      return { exitCode: 0, status: 'succeeded' as const };
    } catch (error) {
      await postAgentEvents({
        ...eventOptions,
        events: [
          {
            eventType: 'error',
            message: error instanceof Error ? error.message : 'Judge failed.',
          },
        ],
      });
      await postAgentCompletion({
        ...eventOptions,
        exitCode: 1,
        status: 'failed',
      });
      return { exitCode: 1, status: 'failed' as const };
    }
  }

  const policy = evaluateDevboxCommandPolicy(command);
  const envFromFiles = await readEnvFiles(job.envFiles ?? [], cwd);
  const jobEnv = {
    ...envFromFiles,
    ...(job.env ?? {}),
  };

  await postAgentEvents({
    ...eventOptions,
    events: [
      { message: redactDevboxSecrets(`remote$ ${command.join(' ')}`, jobEnv) },
    ],
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

  const logUploads: Promise<void>[] = [];
  const recordLog = async (message: string) => {
    await postAgentEvents({
      ...eventOptions,
      events: [{ message: redactDevboxSecrets(message, jobEnv) }],
    });
  };

  const exit = await runProcessGroup({
    command: command[0]!,
    args: command.slice(1),
    cwd,
    env: {
      ...createDevboxChildBaseEnv(options.env ?? process.env),
      ...jobEnv,
    },
    timeoutMs: job.timeoutSeconds
      ? Math.max(1, job.timeoutSeconds) * 1000
      : undefined,
    graceMs: options.killGraceMs,
    cancelSignal: options.cancelSignal,
    cancelCheckMs: options.cancelCheckMs,
    // Remote `ttr box stop` marks the run cancel_requested; the claiming
    // runner observes it through the events endpoint.
    checkCancel: () => readRunCancelRequested(eventOptions, job.runId),
    onOutput: (chunk) => {
      logUploads.push(recordLog(chunk));
    },
  });
  const timedOut = exit.timedOut;

  const exitCode = timedOut
    ? 124
    : exit.cancelled
      ? 143
      : getExitCode(exit.code, exit.signal);
  const status: DevboxAgentCompletionStatus = exit.cancelled
    ? 'cancelled'
    : exitCode === 0
      ? 'succeeded'
      : 'failed';

  if (timedOut) {
    logUploads.push(
      recordLog(`Command timed out after ${job.timeoutSeconds}s.`)
    );
  }
  if (exit.cancelled) logUploads.push(recordLog('Command stopped on request.'));

  await Promise.all(logUploads);

  await postAgentCompletion({
    ...eventOptions,
    exitCode,
    status,
  });

  return { exitCode, status };
}

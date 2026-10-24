import { pollDevboxAgentJobs } from '../platform-devbox';
import { normalizeBaseUrl } from './config';
import { createDevboxAgentCapabilities } from './devbox-agent-capabilities';
import {
  agentRequest,
  backoffDelay,
  type DevboxAgentTiming,
  DevboxAgentTransientError,
  DevboxAgentWatchdogError,
  defaultDevboxAgentTiming,
  isTransientStatus,
} from './devbox-agent-network';
import {
  DEVBOX_UPGRADE_BUSY_RETRY_MS,
  DEVBOX_UPGRADE_CHECK_INTERVAL_MS,
  DevboxCliRepairRequiredError,
  DevboxCliUpgradeBusyError,
  upgradeDevboxCliIfNeeded,
} from './devbox-auto-upgrade';
import { sweepStaleCommitWorktrees } from './devbox-commit-run';
import { prepareJudgeContainers } from './devbox-judge-containers';
import { executeDevboxAgentJob } from './devbox-runner';

function formatResponseStatus(response: Response) {
  return `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
}

function controlPlaneOrigin() {
  const configured = process.env.TUTURUUU_DEVBOX_CONTROL_URL?.trim();
  if (!configured) return null;
  const url = new URL(configured);
  if (url.protocol !== 'https:') {
    throw new Error('TUTURUUU_DEVBOX_CONTROL_URL must use HTTPS.');
  }
  return url.origin;
}

function connectWake(origin: string, token: string): WebSocket {
  const url = new URL('/v1/connect', origin);
  url.protocol = 'wss:';
  const AgentWebSocket = WebSocket as unknown as new (
    url: string,
    options: { headers: Record<string, string> }
  ) => WebSocket;
  return new AgentWebSocket(url.toString(), {
    headers: { 'X-Devbox-Runner-Token': token },
  });
}

function waitForWake(
  socket: WebSocket | null,
  timeoutMs: number,
  localWake: EventTarget
) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      socket?.removeEventListener('message', finish);
      socket?.removeEventListener('close', finish);
      socket?.removeEventListener('error', finish);
      localWake.removeEventListener('wake', finish);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    localWake.addEventListener('wake', finish, { once: true });
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.addEventListener('message', finish, { once: true });
      socket.addEventListener('close', finish, { once: true });
      socket.addEventListener('error', finish, { once: true });
    }
  });
}

export async function runDevboxAgentLoop({
  baseUrl,
  once,
  token,
  timing: timingOverrides,
  exit = (code: number) => process.exit(code),
  random = Math.random,
}: {
  baseUrl?: string;
  once?: boolean;
  token?: string;
  timing?: Partial<DevboxAgentTiming>;
  exit?: (code: number) => void;
  random?: () => number;
}) {
  if (!token) {
    throw new Error(
      'Missing runner token. Run `ttr box agent register` with a logged-in account, then start with --token or TUTURUUU_DEVBOX_RUNNER_TOKEN.'
    );
  }

  const origin = normalizeBaseUrl(baseUrl);
  const controlOrigin = controlPlaneOrigin();
  const headers = {
    'X-Devbox-Runner-Token': token,
  };

  process.stdout.write('Starting Tuturuuu devbox agent.\n');
  const swept = await sweepStaleCommitWorktrees({
    checkout: process.cwd(),
  }).catch(() => 0);
  if (swept)
    process.stdout.write(`Removed ${swept} stale commit run worktree(s).\n`);
  await prepareJudgeContainers(token);
  const timing = { ...defaultDevboxAgentTiming, ...timingOverrides };
  const watchdogMs = timing.heartbeatIntervalMs * timing.watchdogIntervals;
  let lastHeartbeatOkAt = Date.now();
  let heartbeatFailures = 0;
  let pollFailures = 0;
  // Last resort for an await that is still wedged despite request timeouts:
  // exit non-zero so the service manager (Restart=always) recovers the agent.
  const hardWatchdog = setInterval(
    () => {
      if (Date.now() - lastHeartbeatOkAt <= watchdogMs * 2) return;
      console.error(
        `Devbox agent made no heartbeat progress for ${Math.round((watchdogMs * 2) / 1000)}s; exiting for service manager restart.`
      );
      exit(75);
    },
    Math.min(timing.heartbeatIntervalMs, 10_000)
  );
  (hardWatchdog as { unref?: () => void }).unref?.();

  let running = true;
  let wakeSocket: WebSocket | null = null;
  let pendingWake = false;
  const localWake = new EventTarget();
  let nextHeartbeatAt = 0;
  const active = new Set<Promise<void>>();
  let restartRequested = false;
  let cliUpdated = false;
  let failure: unknown = null;
  let nextPollAt = 0;
  let idlePollDelay = 5000;
  let nextUpgradeCheckAt = 0;
  let upgrading = false;
  const waitForJobs = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ...active,
        new Promise<void>((resolve) => {
          timer = setTimeout(
            resolve,
            Math.max(1, nextHeartbeatAt - Date.now())
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const heartbeat = async () => {
    const capabilities = await createDevboxAgentCapabilities();
    const heartbeatResponse = await agentRequest('Devbox agent heartbeat', () =>
      fetch(
        new URL(
          controlOrigin ? '/v1/heartbeat' : '/api/v1/devboxes/agents/heartbeat',
          controlOrigin ?? origin
        ),
        {
          body: JSON.stringify({ capabilities }),
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(timing.httpTimeoutMs),
        }
      )
    );
    if (!heartbeatResponse.ok) {
      // Auth and contract rejections are not retried; the operator must act.
      throw new Error(
        `Devbox agent heartbeat failed: ${formatResponseStatus(heartbeatResponse)}`
      );
    }

    lastHeartbeatOkAt = Date.now();
    heartbeatFailures = 0;
    nextHeartbeatAt = Date.now() + timing.heartbeatIntervalMs;
  };
  // Transient failures retry with jittered backoff (never slower than the
  // heartbeat interval); the watchdog bounds the total outage.
  const tryHeartbeat = async () => {
    try {
      await heartbeat();
    } catch (error) {
      if (!(error instanceof DevboxAgentTransientError) || once) throw error;
      heartbeatFailures += 1;
      const delay = Math.min(
        backoffDelay(heartbeatFailures, timing, random),
        timing.heartbeatIntervalMs
      );
      console.warn(
        `${error.message}; retrying in ${Math.ceil(delay / 1000)}s.`
      );
      nextHeartbeatAt = Date.now() + delay;
    }
    if (Date.now() - lastHeartbeatOkAt > watchdogMs)
      throw new DevboxAgentWatchdogError(
        `No successful devbox heartbeat for ${Math.round(watchdogMs / 1000)}s; exiting for service manager restart.`
      );
  };
  // First SIGTERM/SIGINT: claim nothing new, finish active jobs, exit 0.
  // A second signal also stops active jobs through their process groups.
  // systemd units need KillMode=mixed and a TimeoutStopSec that covers jobs.
  let stopping = false;
  const jobCancel = new AbortController();
  const stopHandlers = (['SIGTERM', 'SIGINT'] as const).map((signal) => {
    const handler = () => {
      if (stopping) {
        console.warn(
          `Received ${signal} again; stopping ${active.size} active job(s).`
        );
        jobCancel.abort();
        return;
      }
      stopping = true;
      running = false;
      console.warn(
        `Received ${signal}; claiming no new jobs and finishing ${active.size} active job(s) before exit.`
      );
      localWake.dispatchEvent(new Event('wake'));
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  try {
    while (running) {
      if (Date.now() >= nextHeartbeatAt) await tryHeartbeat();
      if (failure) throw failure;
      if (restartRequested) break;
      if (upgrading) {
        await waitForJobs();
        continue;
      }
      if (
        controlOrigin &&
        !once &&
        (!wakeSocket || wakeSocket.readyState === WebSocket.CLOSED)
      ) {
        wakeSocket = connectWake(controlOrigin, token);
        wakeSocket.addEventListener('message', () => {
          pendingWake = true;
        });
      }
      if (active.size >= 8) {
        await waitForJobs();
        continue;
      }
      if (!pendingWake && Date.now() < nextPollAt) {
        await waitForWake(
          wakeSocket,
          Math.max(1, Math.min(nextPollAt, nextHeartbeatAt) - Date.now()),
          localWake
        );
        continue;
      }
      // Never claim after a stop signal: claimed jobs must run to completion.
      if (stopping) break;
      pendingWake = false;
      let pollResponse: Awaited<ReturnType<typeof pollDevboxAgentJobs>>;
      let pollError: string | undefined;
      try {
        pollResponse = await pollDevboxAgentJobs({
          baseUrl: controlOrigin ?? origin,
          path: controlOrigin ? '/v1/poll' : undefined,
          timeoutMs: timing.httpTimeoutMs,
          token,
        });
        if (!pollResponse.ok && isTransientStatus(pollResponse.response.status))
          pollError = `Devbox agent poll failed: ${formatResponseStatus(pollResponse.response)}`;
      } catch (error) {
        if (once) throw error;
        pollResponse = { jobs: [], ok: true };
        pollError = `Devbox agent poll failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'network error'}`;
      }
      if (failure) throw failure;
      if (pollError && !once) {
        pollFailures += 1;
        const delay = backoffDelay(pollFailures, timing, random);
        console.warn(`${pollError}; retrying in ${Math.ceil(delay / 1000)}s.`);
        nextPollAt = Date.now() + delay;
        continue;
      }
      if (!pollResponse.ok) {
        throw new Error(
          `Devbox agent poll failed: ${formatResponseStatus(pollResponse.response)}`
        );
      }
      pollFailures = 0;

      if (pollResponse.jobs.length) {
        process.stdout.write(
          `Received ${pollResponse.jobs.length} devbox job(s).\n`
        );
        for (const job of pollResponse.jobs) {
          const restart =
            job.command.length === 1 &&
            job.command[0] === '__ttr_restart_agent_v1__';
          const update =
            job.command.length === 4 &&
            job.command.join(' ') === 'bun i -g tuturuuu';
          const maintenance = restart || update;
          while (active.size >= 8 || (maintenance && active.size > 0)) {
            await waitForJobs();
            if (Date.now() >= nextHeartbeatAt) await tryHeartbeat();
            if (failure) throw failure;
          }
          if (failure) throw failure;
          const task = executeDevboxAgentJob(job, {
            baseUrl: origin,
            cancelSignal: jobCancel.signal,
            token,
          })
            .then((result) => {
              if (result.status === 'succeeded' && (restart || update)) {
                restartRequested = true;
                cliUpdated = update;
              }
            })
            .catch((error) => {
              failure = error;
            })
            .finally(() => {
              active.delete(task);
              pendingWake = true;
              localWake.dispatchEvent(new Event('wake'));
            });
          active.add(task);
          if (maintenance) {
            while (active.has(task)) {
              await waitForJobs();
              if (Date.now() >= nextHeartbeatAt) await tryHeartbeat();
            }
            if (restartRequested || failure) break;
          }
        }
      }
      if (restartRequested || failure) break;
      // The database serializes claims and enforces runner budgets. The local bound
      // also protects ordinary maintenance jobs from exhausting the agent process.

      if (once) {
        running = false;
        continue;
      }
      if (pollResponse.jobs.length || pendingWake) {
        idlePollDelay = 5000;
        nextPollAt = 0;
        continue;
      }
      nextPollAt = Date.now() + (controlOrigin ? 30_000 : idlePollDelay);
      idlePollDelay = Math.min(30_000, idlePollDelay * 2);
      if (
        active.size === 0 &&
        Date.now() >= nextUpgradeCheckAt &&
        process.env.TUTURUUU_DEVBOX_AUTO_UPGRADE === 'true'
      ) {
        nextUpgradeCheckAt = Date.now() + DEVBOX_UPGRADE_CHECK_INTERVAL_MS;
        upgrading = true;
        const task = upgradeDevboxCliIfNeeded()
          .then((updated) => {
            if (updated) {
              restartRequested = true;
              cliUpdated = true;
            }
          })
          .catch((error) => {
            if (error instanceof DevboxCliUpgradeBusyError) {
              nextUpgradeCheckAt = Date.now() + DEVBOX_UPGRADE_BUSY_RETRY_MS;
              return;
            }
            const message =
              error instanceof Error
                ? error.message
                : 'Unknown upgrade failure';
            if (error instanceof DevboxCliRepairRequiredError) {
              failure = error;
              console.error(
                `Automatic devbox CLI upgrade requires repair: ${message}`
              );
              return;
            }
            console.warn(`Automatic devbox CLI upgrade failed: ${message}`);
          })
          .finally(() => {
            upgrading = false;
            active.delete(task);
            pendingWake = true;
            localWake.dispatchEvent(new Event('wake'));
          });
        active.add(task);
      }
    }
  } finally {
    while (active.size > 0) {
      await waitForJobs();
      if (active.size > 0 && Date.now() >= nextHeartbeatAt) {
        try {
          await tryHeartbeat();
        } catch (error) {
          failure ??= error;
          nextHeartbeatAt = Date.now() + timing.heartbeatIntervalMs;
          console.warn('Devbox heartbeat failed while draining active jobs.');
        }
      }
    }
    wakeSocket?.close();
    clearInterval(hardWatchdog);
    for (const [signal, handler] of stopHandlers)
      process.removeListener(signal, handler);
  }
  if (failure) throw failure;
  if (stopping)
    process.stdout.write('Devbox agent stopped after draining active jobs.\n');
  if (restartRequested)
    process.stdout.write(
      cliUpdated
        ? 'Devbox CLI updated. Exiting for service manager restart.\n'
        : 'Restart requested. Exiting for service manager restart.\n'
    );
}

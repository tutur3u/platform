import { pollDevboxAgentJobs } from '../platform-devbox';
import { normalizeBaseUrl } from './config';
import { createDevboxAgentCapabilities } from './devbox-agent-capabilities';
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
}: {
  baseUrl?: string;
  once?: boolean;
  token?: string;
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

  let running = true;
  let wakeSocket: WebSocket | null = null;
  let pendingWake = false;
  const localWake = new EventTarget();
  let nextHeartbeatAt = 0;
  const active = new Set<Promise<void>>();
  let restartRequested = false;
  let cliUpdated = false;
  let failure: unknown = null;
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
    const heartbeatResponse = await fetch(
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
      }
    );
    if (!heartbeatResponse.ok) {
      throw new Error(
        `Devbox agent heartbeat failed: ${formatResponseStatus(heartbeatResponse)}`
      );
    }

    nextHeartbeatAt = Date.now() + 20_000;
  };
  try {
    while (running) {
      if (Date.now() >= nextHeartbeatAt) await heartbeat();
      if (failure) throw failure;
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
      pendingWake = false;
      const pollResponse = await pollDevboxAgentJobs({
        baseUrl: controlOrigin ?? origin,
        path: controlOrigin ? '/v1/poll' : undefined,
        token,
      });
      if (failure) throw failure;
      if (!pollResponse.ok) {
        throw new Error(
          `Devbox agent poll failed: ${formatResponseStatus(pollResponse.response)}`
        );
      }

      if (pollResponse.jobs.length) {
        process.stdout.write(
          `Received ${pollResponse.jobs.length} devbox job(s).\n`
        );
        for (const job of pollResponse.jobs) {
          const maintenance =
            job.command[0] === '__ttr_restart_agent_v1__' ||
            job.command.join(' ') === 'bun i -g tuturuuu';
          while (active.size >= 8 || (maintenance && active.size > 0)) {
            await waitForJobs();
            if (Date.now() >= nextHeartbeatAt) await heartbeat();
            if (failure) throw failure;
          }
          if (failure) throw failure;
          const task = executeDevboxAgentJob(job, { baseUrl: origin, token })
            .then((result) => {
              const restart =
                job.command.length === 1 &&
                job.command[0] === '__ttr_restart_agent_v1__';
              const update =
                job.command.length === 4 &&
                job.command.join(' ') === 'bun i -g tuturuuu';
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
              if (Date.now() >= nextHeartbeatAt) await heartbeat();
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
      if (pollResponse.jobs.length || pendingWake) continue;
      if (controlOrigin)
        await waitForWake(
          wakeSocket,
          Math.max(1, nextHeartbeatAt - Date.now()),
          localWake
        );
      else await waitForWake(null, 5000, localWake);
    }
  } finally {
    while (active.size > 0) {
      await waitForJobs();
      if (active.size > 0 && Date.now() >= nextHeartbeatAt) {
        try {
          await heartbeat();
        } catch (error) {
          failure ??= error;
          nextHeartbeatAt = Date.now() + 20_000;
          console.warn('Devbox heartbeat failed while draining active jobs.');
        }
      }
    }
    wakeSocket?.close();
  }
  if (failure) throw failure;
  if (restartRequested)
    process.stdout.write(
      cliUpdated
        ? 'Devbox CLI updated. Exiting for service manager restart.\n'
        : 'Restart requested. Exiting for service manager restart.\n'
    );
}

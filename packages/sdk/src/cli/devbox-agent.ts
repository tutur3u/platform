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

function waitForWake(socket: WebSocket | null, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      setTimeout(resolve, timeoutMs);
      return;
    }
    const finish = () => {
      clearTimeout(timeout);
      socket.removeEventListener('message', finish);
      socket.removeEventListener('close', finish);
      socket.removeEventListener('error', finish);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    socket.addEventListener('message', finish, { once: true });
    socket.addEventListener('close', finish, { once: true });
    socket.addEventListener('error', finish, { once: true });
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
  while (running) {
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

    if (
      controlOrigin &&
      !once &&
      (!wakeSocket || wakeSocket.readyState === WebSocket.CLOSED)
    ) {
      wakeSocket = connectWake(controlOrigin, token);
    }
    const pollResponse = await pollDevboxAgentJobs({
      baseUrl: controlOrigin ?? origin,
      path: controlOrigin ? '/v1/poll' : undefined,
      token,
    });
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
        const result = await executeDevboxAgentJob(job, {
          baseUrl: origin,
          token,
        });
        if (
          result.status === 'succeeded' &&
          job.command.length === 1 &&
          job.command[0] === '__ttr_restart_agent_v1__'
        ) {
          process.stdout.write(
            'Restart requested. Exiting for service manager restart.\n'
          );
          wakeSocket?.close();
          return;
        }
        if (
          result.status === 'succeeded' &&
          job.command.length === 4 &&
          job.command[0] === 'bun' &&
          job.command[1] === 'i' &&
          job.command[2] === '-g' &&
          job.command[3] === 'tuturuuu'
        ) {
          process.stdout.write(
            'Devbox CLI updated. Exiting for service manager restart.\n'
          );
          wakeSocket?.close();
          return;
        }
      }
    }

    if (once) {
      running = false;
      continue;
    }
    if (controlOrigin) await waitForWake(wakeSocket, 30_000);
    else await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  wakeSocket?.close();
}

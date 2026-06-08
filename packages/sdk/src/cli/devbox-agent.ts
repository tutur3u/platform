import { pollDevboxAgentJobs } from '../platform-devbox';
import { normalizeBaseUrl } from './config';
import { executeDevboxAgentJob } from './devbox-runner';

function formatResponseStatus(response: Response) {
  return `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
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
  const headers = {
    'X-Devbox-Runner-Token': token,
  };

  process.stdout.write('Starting Tuturuuu devbox agent.\n');

  let running = true;
  while (running) {
    const heartbeatResponse = await fetch(
      new URL('/api/v1/devboxes/agents/heartbeat', origin),
      {
        headers,
        method: 'POST',
      }
    );
    if (!heartbeatResponse.ok) {
      throw new Error(
        `Devbox agent heartbeat failed: ${formatResponseStatus(heartbeatResponse)}`
      );
    }

    const pollResponse = await pollDevboxAgentJobs({
      baseUrl: origin,
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
        await executeDevboxAgentJob(job, {
          baseUrl: origin,
          token,
        });
      }
    }

    if (once) {
      running = false;
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

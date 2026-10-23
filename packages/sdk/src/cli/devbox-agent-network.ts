// Agent HTTP calls must never block the loop: a hung socket previously froze
// every Judge agent with a stale heartbeat and no restart.
// Matches DEVBOX_AGENT_REQUEST_TIMEOUT_MS in platform-devbox.ts.
export const DEVBOX_AGENT_HTTP_TIMEOUT_MS = 15_000;

export interface DevboxAgentTiming {
  httpTimeoutMs: number;
  heartbeatIntervalMs: number;
  // Missed heartbeat intervals before the agent exits for a supervised restart.
  watchdogIntervals: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}
export const defaultDevboxAgentTiming: DevboxAgentTiming = {
  httpTimeoutMs: DEVBOX_AGENT_HTTP_TIMEOUT_MS,
  heartbeatIntervalMs: 20_000,
  watchdogIntervals: 6,
  backoffBaseMs: 2000,
  backoffMaxMs: 60_000,
};

/** Retryable network, timeout, throttling or server failure. */
export class DevboxAgentTransientError extends Error {
  override name = 'DevboxAgentTransientError';
}
/** No successful heartbeat inside the watchdog window. */
export class DevboxAgentWatchdogError extends Error {
  override name = 'DevboxAgentWatchdogError';
}

export function isTransientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

// Thrown fetch errors (refused, reset, DNS, abort/timeout) are transient.
// HTTP responses are classified by status; auth failures stay fatal.
export async function agentRequest(
  label: string,
  request: () => Promise<Response>
) {
  let response: Response;
  try {
    response = await request();
  } catch (error) {
    throw new DevboxAgentTransientError(
      `${label} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'network error'}`
    );
  }
  if (!response.ok && isTransientStatus(response.status))
    throw new DevboxAgentTransientError(
      `${label} failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    );
  return response;
}

export function backoffDelay(
  attempt: number,
  timing: Pick<DevboxAgentTiming, 'backoffBaseMs' | 'backoffMaxMs'>,
  random = Math.random
) {
  const ceiling = Math.min(
    timing.backoffMaxMs,
    timing.backoffBaseMs * 2 ** Math.max(0, attempt - 1)
  );
  // Full jitter in the upper half keeps restarts from synchronizing.
  return Math.max(1, Math.round(ceiling * (0.5 + random() * 0.5)));
}

// Event and completion uploads retry transient failures a bounded number of
// times so a brief outage does not strand a finished run as running.
export async function withAgentRetries<T>(
  action: () => Promise<T>,
  attempts = 3,
  timing: Pick<DevboxAgentTiming, 'backoffBaseMs' | 'backoffMaxMs'> = {
    backoffBaseMs: 1000,
    backoffMaxMs: 8000,
  },
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof DevboxAgentTransientError) || attempt >= attempts)
        throw error;
      await sleep(backoffDelay(attempt, timing));
    }
  }
}

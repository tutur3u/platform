import type { DevboxEnv } from '@tuturuuu/devbox';
import {
  createInternalApiClient,
  encodePathSegment,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import { DevboxFleetClient } from './platform-devbox-fleet';

export interface DevboxRunPayload {
  command: string[];
  workload?: 'run' | 'build' | 'serve' | 'tunnel' | 'maintenance';
  env?: DevboxEnv;
  envFiles?: string[];
  /**
   * Client operation ID (16-128 of `A-Za-z0-9_-`). The server returns the
   * existing run for a repeated key instead of creating a second one.
   */
  idempotencyKey?: string;
  keep?: boolean;
  leaseId?: string;
  leaseMode: 'auto' | 'existing';
  previewPorts?: number[];
  reuse?: boolean;
  runnerId?: string;
  timeoutSeconds?: number;
}

export interface DevboxRunResponse {
  lease?: {
    id: string;
    status: string;
  };
  logs?: string[];
  run: {
    command: string[];
    exitCode?: number | null;
    id: string;
    status: string;
  };
}

export interface DevboxAgentJob {
  command: string[];
  createdAt?: string;
  env?: DevboxEnv;
  envFiles?: string[];
  leaseId: string;
  previewPorts?: number[];
  runId: string;
  timeoutSeconds?: number | null;
  updatedAt?: string;
}

export interface DevboxAgentEventPayload {
  completion?: {
    exitCode: number;
    status: 'cancelled' | 'failed' | 'succeeded';
  };
  events?: {
    eventType?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }[];
  runId: string;
}

export interface DevboxLeasePayload {
  profile?: string;
  runnerId?: string;
  ttlSeconds?: number;
}

export interface DevboxLeaseResponse {
  lease: {
    id: string;
    status: string;
  };
}

export interface DevboxAgentRegistrationResponse {
  runner: {
    id: string;
    name: string;
  };
  token: string;
}

export interface DevboxAgentShutdownResponse {
  message: string;
  runner: {
    id: string;
    status: string;
  };
}

export class DevboxesClient {
  private readonly api;
  readonly fleet: DevboxFleetClient;

  constructor(options: InternalApiClientOptions, fleetOptions = options) {
    this.api = createInternalApiClient(options);
    this.fleet = new DevboxFleetClient(fleetOptions);
  }

  createRun(payload: DevboxRunPayload, options: { signal?: AbortSignal } = {}) {
    return this.api.json<DevboxRunResponse>('/api/v1/devboxes/runs', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: options.signal,
    });
  }

  listRuns() {
    return this.api.json<{ runs: DevboxRunResponse['run'][] }>(
      '/api/v1/devboxes/runs'
    );
  }

  createLease(payload: DevboxLeasePayload) {
    return this.api.json<DevboxLeaseResponse>('/api/v1/devboxes/leases', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  releaseLease(leaseId: string) {
    return this.api.json<{ message: string }>(
      `/api/v1/devboxes/leases/${encodePathSegment(leaseId)}/release`,
      { method: 'POST' }
    );
  }

  getRun(runId: string, options: { signal?: AbortSignal } = {}) {
    return this.api.json<DevboxRunResponse>(
      `/api/v1/devboxes/runs/${encodePathSegment(runId)}`,
      { signal: options.signal }
    );
  }

  stopRun(runId: string, options: { signal?: AbortSignal } = {}) {
    return this.api.json<{ message: string }>(
      `/api/v1/devboxes/runs/${encodePathSegment(runId)}/stop`,
      { method: 'POST', signal: options.signal }
    );
  }

  /** Stops the caller's run created with this idempotency key. */
  stopRunByKey(idempotencyKey: string, options: { signal?: AbortSignal } = {}) {
    return this.api.json<{ message: string; runId: string; status: string }>(
      '/api/v1/devboxes/runs/stop-by-key',
      {
        body: JSON.stringify({ idempotencyKey }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: options.signal,
      }
    );
  }

  /**
   * One page of run log lines. `next` is the cursor for the following page
   * (the last per-run event sequence returned, so lines that commit late are
   * never skipped); servers that predate paging omit it and return only the
   * first page.
   */
  getRunLogs(
    runId: string,
    options: { offset?: number; signal?: AbortSignal } = {}
  ) {
    return this.api.json<{ logs: string[]; next?: number }>(
      `/api/v1/devboxes/runs/${encodePathSegment(runId)}/logs`,
      { query: { offset: options.offset }, signal: options.signal }
    );
  }

  createPreview(payload: { leaseId: string; port: number }) {
    return this.api.json<{ url: string }>('/api/v1/devboxes/previews', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  registerAgent(payload: { name: string }) {
    return this.api.json<DevboxAgentRegistrationResponse>(
      '/api/v1/devboxes/agents/register',
      {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    );
  }

  updateEnv(payload: {
    leaseId: string;
    removals?: string[];
    updates?: DevboxEnv;
  }) {
    return this.api.json<{ revision: number }>('/api/v1/devboxes/env', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  }

  getCache() {
    return this.api.json<{ caches: unknown[] }>('/api/v1/devboxes/cache');
  }

  pruneCache() {
    return this.api.json<{ message: string }>('/api/v1/devboxes/cache/prune', {
      method: 'POST',
    });
  }
}

// Agent HTTP calls are bounded: the signal also covers reading the body.
export const DEVBOX_AGENT_REQUEST_TIMEOUT_MS = 15_000;

export async function pollDevboxAgentJobs({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  path = '/api/v1/devboxes/agents/poll',
  timeoutMs = DEVBOX_AGENT_REQUEST_TIMEOUT_MS,
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  path?: string;
  timeoutMs?: number;
  token: string;
}) {
  const response = await fetchImpl(new URL(path, baseUrl), {
    headers: {
      'X-Devbox-Runner-Token': token,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return { ok: false as const, response };

  const payload = (await response.json()) as { jobs?: DevboxAgentJob[] };
  return { jobs: payload.jobs ?? [], ok: true as const };
}

export async function recordDevboxAgentEvents({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  payload,
  timeoutMs = DEVBOX_AGENT_REQUEST_TIMEOUT_MS,
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  payload: DevboxAgentEventPayload;
  timeoutMs?: number;
  token: string;
}) {
  return fetchImpl(new URL('/api/v1/devboxes/agents/events', baseUrl), {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      'X-Devbox-Runner-Token': token,
    },
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function shutdownDevboxAgent({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEVBOX_AGENT_REQUEST_TIMEOUT_MS,
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  token: string;
}) {
  const response = await fetchImpl(
    new URL('/api/v1/devboxes/agents/shutdown', baseUrl),
    {
      headers: {
        'X-Devbox-Runner-Token': token,
      },
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!response.ok) return { ok: false as const, response };

  const payload = (await response.json()) as DevboxAgentShutdownResponse;
  return { ok: true as const, payload };
}

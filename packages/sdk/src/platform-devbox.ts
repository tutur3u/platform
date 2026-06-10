import type { DevboxEnv } from '@tuturuuu/devbox';
import {
  createInternalApiClient,
  encodePathSegment,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';

export interface DevboxRunPayload {
  command: string[];
  env?: DevboxEnv;
  envFiles?: string[];
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

  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }

  createRun(payload: DevboxRunPayload) {
    return this.api.json<DevboxRunResponse>('/api/v1/devboxes/runs', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
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

  getRun(runId: string) {
    return this.api.json<DevboxRunResponse>(
      `/api/v1/devboxes/runs/${encodePathSegment(runId)}`
    );
  }

  stopRun(runId: string) {
    return this.api.json<{ message: string }>(
      `/api/v1/devboxes/runs/${encodePathSegment(runId)}/stop`,
      { method: 'POST' }
    );
  }

  getRunLogs(runId: string) {
    return this.api.json<{ logs: string[] }>(
      `/api/v1/devboxes/runs/${encodePathSegment(runId)}/logs`
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

export async function pollDevboxAgentJobs({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  token: string;
}) {
  const response = await fetchImpl(
    new URL('/api/v1/devboxes/agents/poll', baseUrl),
    {
      headers: {
        'X-Devbox-Runner-Token': token,
      },
    }
  );
  if (!response.ok) return { ok: false as const, response };

  const payload = (await response.json()) as { jobs?: DevboxAgentJob[] };
  return { jobs: payload.jobs ?? [], ok: true as const };
}

export async function recordDevboxAgentEvents({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  payload,
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  payload: DevboxAgentEventPayload;
  token: string;
}) {
  return fetchImpl(new URL('/api/v1/devboxes/agents/events', baseUrl), {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      'X-Devbox-Runner-Token': token,
    },
    method: 'POST',
  });
}

export async function shutdownDevboxAgent({
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
  token,
}: {
  baseUrl: string;
  fetch?: typeof fetch;
  token: string;
}) {
  const response = await fetchImpl(
    new URL('/api/v1/devboxes/agents/shutdown', baseUrl),
    {
      headers: {
        'X-Devbox-Runner-Token': token,
      },
      method: 'POST',
    }
  );
  if (!response.ok) return { ok: false as const, response };

  const payload = (await response.json()) as DevboxAgentShutdownResponse;
  return { ok: true as const, payload };
}

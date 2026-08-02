import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ExecuteLiveToolPayload {
  args: Record<string, unknown>;
  functionName: string;
  wsId: string;
}

export interface ExecuteLiveToolOptions extends InternalApiClientOptions {
  signal?: AbortSignal;
}

export interface ExecuteLiveToolResponse {
  result: Record<string, unknown>;
}

export async function executeLiveTool(
  payload: ExecuteLiveToolPayload,
  options: ExecuteLiveToolOptions = {}
) {
  const { signal, ...clientOptions } = options;
  const client = getInternalApiClient(clientOptions);

  return client.json<ExecuteLiveToolResponse>('/api/v1/live/tools/execute', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal,
  });
}

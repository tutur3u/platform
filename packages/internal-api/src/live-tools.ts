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

export type LiveCreditSource = 'personal' | 'workspace';

export interface GeminiLiveUsageSnapshot {
  inputAudioTokens: number;
  inputImageTokens: number;
  inputTextTokens: number;
  inputVideoTokens: number;
  outputAudioTokens: number;
  outputTextTokens: number;
  searchQueries: number;
  thinkingTokens: number;
}

export interface CreateLiveSessionPayload {
  creditSource: LiveCreditSource;
  creditWsId?: string;
  wsId: string;
}

export interface CreateLiveSessionResponse {
  expiresAt: string;
  liveSessionId: string;
  model: string;
  reservedCredits: number;
  scopeKey: string;
  token: string;
}

export interface ReportLiveUsagePayload {
  close?: boolean;
  liveSessionId: string;
  sequence: number;
  usage: GeminiLiveUsageSnapshot;
}

export interface ReportLiveUsageResponse {
  billedCredits: number;
  closed: boolean;
  providerCostUsd: number;
  remainingReservedCredits: number;
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

export async function createLiveSession(
  payload: CreateLiveSessionPayload,
  options: InternalApiClientOptions = {}
) {
  const client = getInternalApiClient(options);
  return client.json<CreateLiveSessionResponse>('/api/v1/live/token', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function reportLiveUsage(
  payload: ReportLiveUsagePayload,
  options: InternalApiClientOptions & { keepalive?: boolean } = {}
) {
  const { keepalive, ...clientOptions } = options;
  const client = getInternalApiClient(clientOptions);
  return client.json<ReportLiveUsageResponse>('/api/v1/live/usage', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    keepalive,
    method: 'POST',
  });
}

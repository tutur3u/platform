import { getAiMemoryConfig } from './config';
import type { AiMemoryConfig } from './types';

type RequestOptions = {
  timeout?: number;
};

type AddMemoryPayload = {
  containerTag: string;
  content: string;
  customId: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

type SearchMemoriesPayload = {
  containerTag: string;
  embedding: number[];
  filters?: unknown;
  include?: unknown;
  limit: number;
  q: string;
  searchMode?: 'hybrid';
};

type ListDocumentsPayload = {
  containerTags: string[];
  filters?: unknown;
  includeContent: boolean;
  limit: number;
  order: 'asc' | 'desc';
  sort: 'updatedAt';
};

type ForgetMemoryPayload = {
  containerTag: string;
  id: string;
  reason: string;
};

let cachedClient: AiMemoryServiceClient | null = null;
let cachedSignature: string | null = null;

function configSignature(config: AiMemoryConfig) {
  return [config.apiKey, config.baseUrl ?? ''].join('|');
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/u, '');
}

export class AiMemoryServiceClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: AiMemoryConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = trimTrailingSlash(
      config.baseUrl ?? 'http://supermemory:8787'
    );
    this.timeoutMs = config.timeoutMs;
  }

  async add(payload: AddMemoryPayload, options?: RequestOptions) {
    return this.post<{ id: string; status: string }>(
      '/v1/memories',
      payload,
      options
    );
  }

  async searchMemories(
    payload: SearchMemoriesPayload,
    options?: RequestOptions
  ) {
    return this.post<{
      results: Array<{
        chunk?: string;
        id: string;
        memory?: string;
        metadata?: Record<string, unknown> | null;
        similarity?: number;
        updatedAt?: string;
      }>;
    }>('/v1/search', payload, options);
  }

  async listDocuments(payload: ListDocumentsPayload, options?: RequestOptions) {
    return this.post<{
      memories: Array<{
        content?: string | null;
        id: string;
        metadata?: unknown;
        status: string;
        summary?: string | null;
        title?: string | null;
        updatedAt: string;
      }>;
    }>('/v1/documents/list', payload, options);
  }

  async forgetMemory(payload: ForgetMemoryPayload, options?: RequestOptions) {
    return this.post<{ forgotten: boolean; id: string }>(
      '/v1/memories/forget',
      payload,
      options
    );
  }

  private async post<T>(
    path: string,
    payload: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options?.timeout ?? this.timeoutMs
    );

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `AI memory request failed with HTTP ${response.status}`
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getAiMemoryServiceClient(config = getAiMemoryConfig()) {
  if (!config) return null;

  const signature = configSignature(config);
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = new AiMemoryServiceClient(config);
    cachedSignature = signature;
  }

  return cachedClient;
}

export const getSupermemoryClient = getAiMemoryServiceClient;

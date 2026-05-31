import { getSupermemoryClient } from './client';
import { getAiMemoryConfig } from './config';
import { buildProductFilter } from './scope';
import type {
  AiMemoryConfig,
  AiMemoryDocument,
  AiMemoryMetadata,
  AiMemoryResult,
  AiMemoryScope,
  AiMemorySearchResult,
} from './types';

const DEFAULT_CONTEXT_LIMIT = 8;

function skipped<T>(reason: string, value?: T): AiMemoryResult<T> {
  return { ok: true, reason, skipped: true, value };
}

function fail<T>(
  error: unknown,
  fallback: T,
  failOpen: boolean
): AiMemoryResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  if (failOpen) return skipped(message, fallback);
  return { error: message, ok: false };
}

function requestOptions(timeoutMs: number) {
  return {
    maxRetries: 1,
    timeout: timeoutMs,
  };
}

type SupermemoryClient = NonNullable<ReturnType<typeof getSupermemoryClient>>;

type AiMemoryRuntime<T> =
  | {
      client: SupermemoryClient;
      config: AiMemoryConfig;
      ready: true;
      scope: AiMemoryScope;
    }
  | {
      client?: never;
      config?: never;
      ready: false;
      scope?: never;
      skip: AiMemoryResult<T>;
    };

function buildMemoryContent({
  category,
  key,
  value,
}: {
  category?: string | null;
  key?: string | null;
  value: string;
}) {
  return [category ? `[${category}]` : null, key ? `${key}:` : null, value]
    .filter(Boolean)
    .join(' ');
}

function categoryFilter(category: string) {
  return {
    filterType: 'metadata' as const,
    key: 'memoryCategory',
    value: category,
  };
}

function normalizeSearchResult(result: {
  chunk?: string;
  id: string;
  memory?: string;
  metadata?: Record<string, unknown> | null;
  similarity?: number;
  updatedAt?: string;
}): AiMemorySearchResult {
  const metadata = (result.metadata ?? null) as AiMemoryMetadata | null;
  return {
    id: result.id,
    key:
      typeof metadata?.memoryKey === 'string' ? metadata.memoryKey : undefined,
    metadata,
    score: result.similarity ?? 0,
    updatedAt: result.updatedAt ?? new Date(0).toISOString(),
    value: result.memory ?? result.chunk ?? '',
  };
}

function normalizeDocument(doc: {
  content?: string | null;
  id: string;
  metadata?: unknown;
  status: string;
  summary?: string | null;
  title?: string | null;
  updatedAt: string;
}): AiMemoryDocument {
  const metadata =
    doc.metadata &&
    typeof doc.metadata === 'object' &&
    !Array.isArray(doc.metadata)
      ? (doc.metadata as AiMemoryMetadata)
      : null;
  return {
    category:
      typeof metadata?.memoryCategory === 'string'
        ? metadata.memoryCategory
        : null,
    content: doc.content,
    id: doc.id,
    key:
      typeof metadata?.memoryKey === 'string' ? metadata.memoryKey : undefined,
    metadata,
    status: doc.status,
    summary: doc.summary,
    title: doc.title,
    updatedAt: doc.updatedAt,
  };
}

async function ensureMemoryRuntime<T>({
  fallback,
  ignoreSettings = false,
  scope,
}: {
  fallback: T;
  ignoreSettings?: boolean;
  scope: AiMemoryScope | null;
}): Promise<AiMemoryRuntime<T>> {
  const config = getAiMemoryConfig();
  const client = getSupermemoryClient(config);
  if (!scope || !config || !client) {
    return {
      ready: false,
      skip: skipped('supermemory_not_configured', fallback),
    };
  }

  if (!ignoreSettings) {
    const { isAiMemoryEnabledForScope } = await import('./settings');
    const enabled = await isAiMemoryEnabledForScope({
      product: scope.product,
      userId: scope.userId,
      wsId: scope.wsId,
    });
    if (!enabled) {
      return {
        ready: false,
        skip: skipped('ai_memory_disabled', fallback),
      };
    }
  }

  return { client, config, ready: true, scope };
}

export async function rememberAiMemory({
  category,
  ignoreSettings,
  key,
  scope,
  value,
}: {
  category?: string | null;
  ignoreSettings?: boolean;
  key?: string | null;
  scope: AiMemoryScope | null;
  value: string;
}): Promise<AiMemoryResult<{ id: string; status: string } | null>> {
  const runtime = await ensureMemoryRuntime<{
    id: string;
    status: string;
  } | null>({
    fallback: null,
    ignoreSettings,
    scope,
  });
  if (!runtime.ready) return runtime.skip;

  try {
    const content = buildMemoryContent({ category, key, value });
    const metadata: AiMemoryMetadata = {
      ...runtime.scope.metadata,
      ...(category ? { memoryCategory: category } : {}),
      ...(key ? { memoryKey: key } : {}),
    };
    const response = await runtime.client.add(
      {
        containerTag: runtime.scope.containerTag,
        content,
        customId: runtime.scope.customId,
        metadata,
      },
      requestOptions(runtime.config.timeoutMs)
    );

    return { ok: true, value: response };
  } catch (error) {
    return fail(error, null, runtime.config.failOpen);
  }
}

export async function searchAiMemories({
  category,
  ignoreSettings,
  includeProductFilter = false,
  limit = DEFAULT_CONTEXT_LIMIT,
  query,
  scope,
}: {
  category?: string | null;
  ignoreSettings?: boolean;
  includeProductFilter?: boolean;
  limit?: number;
  query: string;
  scope: AiMemoryScope | null;
}): Promise<AiMemoryResult<AiMemorySearchResult[]>> {
  const runtime = await ensureMemoryRuntime<AiMemorySearchResult[]>({
    fallback: [],
    ignoreSettings,
    scope,
  });
  if (!runtime.ready) return runtime.skip;

  try {
    const filters = [
      includeProductFilter ? buildProductFilter(runtime.scope.product) : null,
      category ? categoryFilter(category) : null,
    ].filter(Boolean);
    const response = await runtime.client.search.memories(
      {
        containerTag: runtime.scope.containerTag,
        filters: (filters.length > 1 ? { AND: filters } : filters[0]) as never,
        include: { documents: true, summaries: true },
        limit,
        q: query.trim() || 'user preferences facts conversation history',
        searchMode: 'hybrid',
      },
      requestOptions(runtime.config.timeoutMs)
    );

    return {
      ok: true,
      value: response.results
        .map((result) => normalizeSearchResult(result))
        .filter((result) => result.value.trim()),
    };
  } catch (error) {
    return fail<AiMemorySearchResult[]>(error, [], runtime.config.failOpen);
  }
}

export async function listAiMemories({
  category,
  ignoreSettings,
  limit = 100,
  scope,
}: {
  category?: string | null;
  ignoreSettings?: boolean;
  limit?: number;
  scope: AiMemoryScope | null;
}): Promise<AiMemoryResult<AiMemoryDocument[]>> {
  const runtime = await ensureMemoryRuntime<AiMemoryDocument[]>({
    fallback: [],
    ignoreSettings,
    scope,
  });
  if (!runtime.ready) return runtime.skip;

  try {
    const filters = category
      ? {
          AND: [
            buildProductFilter(runtime.scope.product),
            categoryFilter(category),
          ],
        }
      : buildProductFilter(runtime.scope.product);
    const response = await runtime.client.documents.list(
      {
        containerTags: [runtime.scope.containerTag],
        filters: filters as never,
        includeContent: true,
        limit,
        order: 'desc',
        sort: 'updatedAt',
      },
      requestOptions(runtime.config.timeoutMs)
    );

    return {
      ok: true,
      value: response.memories.map((doc) => normalizeDocument(doc)),
    };
  } catch (error) {
    return fail<AiMemoryDocument[]>(error, [], runtime.config.failOpen);
  }
}

export async function forgetAiMemory({
  ignoreSettings,
  key,
  memoryId,
  reason = 'User requested memory deletion from Tuturuuu.',
  scope,
}: {
  ignoreSettings?: boolean;
  key?: string | null;
  memoryId?: string | null;
  reason?: string;
  scope: AiMemoryScope | null;
}): Promise<AiMemoryResult<{ forgotten: boolean; id: string } | null>> {
  const runtime = await ensureMemoryRuntime<{
    forgotten: boolean;
    id: string;
  } | null>({
    fallback: null,
    ignoreSettings,
    scope,
  });
  if (!runtime.ready) return runtime.skip;

  try {
    if (memoryId) {
      const response = await runtime.client.memories.forget(
        {
          containerTag: runtime.scope.containerTag,
          id: memoryId,
          reason,
        },
        requestOptions(runtime.config.timeoutMs)
      );
      return { ok: true, value: response };
    }

    if (key) {
      const matches = await searchAiMemories({
        ignoreSettings,
        limit: 5,
        query: key,
        scope: runtime.scope,
      });
      if (!matches.ok) return matches;

      const exact = (matches.value ?? []).find((match) => match.key === key);
      if (!exact) {
        return skipped<{ forgotten: boolean; id: string } | null>(
          'memory_not_found',
          null
        );
      }

      const response = await runtime.client.memories.forget(
        {
          containerTag: runtime.scope.containerTag,
          id: exact.id,
          reason,
        },
        requestOptions(runtime.config.timeoutMs)
      );
      return { ok: true, value: response };
    }

    return { error: 'memoryId or key is required', ok: false };
  } catch (error) {
    return fail(error, null, runtime.config.failOpen);
  }
}

export async function buildAiMemoryContext({
  ignoreSettings,
  limit = DEFAULT_CONTEXT_LIMIT,
  query,
  scope,
}: {
  ignoreSettings?: boolean;
  limit?: number;
  query?: string | null;
  scope: AiMemoryScope | null;
}): Promise<string> {
  const search = await searchAiMemories({
    ignoreSettings,
    limit,
    query: query ?? '',
    scope,
  });
  if (!search.ok || !search.value?.length) return '';

  const lines = search.value.map((memory) => {
    const key = memory.key ? `${memory.key}: ` : '';
    return `- ${key}${memory.value}`;
  });

  return `## User Memories\n${lines.join('\n')}`;
}

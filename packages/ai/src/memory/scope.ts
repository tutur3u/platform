import { createHash } from 'node:crypto';
import type {
  AiMemoryMetadata,
  AiMemoryScope,
  AiMemoryScopeInput,
} from './types';

const MAX_SUPERMEMORY_ID_LENGTH = 100;
const SAFE_ID_PATTERN = /[^a-zA-Z0-9._-]+/g;

function safeId(value: string, fallback: string) {
  const normalized = value.replace(SAFE_ID_PATTERN, '_').replace(/_+/g, '_');
  const safe = normalized.replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function compactId(value: string, fallback: string) {
  const safe = safeId(value, fallback);
  if (safe.length <= MAX_SUPERMEMORY_ID_LENGTH) return safe;

  const hash = createHash('sha256').update(safe).digest('hex').slice(0, 12);
  const prefix = safe.slice(0, MAX_SUPERMEMORY_ID_LENGTH - hash.length - 1);
  return `${prefix}.${hash}`;
}

function metadataValueToSafeValue(value: AiMemoryMetadata[string]) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.slice(0, 300));
  }

  if (typeof value === 'string') return value.slice(0, 1000);
  return value;
}

function normalizeMetadata(metadata?: AiMemoryMetadata): AiMemoryMetadata {
  const normalized: AiMemoryMetadata = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    const safeKey = safeId(key, 'metadata').slice(0, 80);
    normalized[safeKey] = metadataValueToSafeValue(value);
  }
  return normalized;
}

export function resolveAiMemoryScope(
  input: AiMemoryScopeInput
): AiMemoryScope | null {
  const userId = input.userId?.trim();
  const wsId = input.wsId?.trim();
  if (!userId || !wsId) return null;

  const containerTag = compactId(
    `tuturuuu.user.${userId}.workspace.${wsId}`,
    'tuturuuu.user.workspace'
  );
  const customId = compactId(
    [
      'tuturuuu',
      input.product,
      input.surface,
      input.customId?.trim() || input.source?.trim() || 'request',
    ].join('.'),
    'tuturuuu.request'
  );

  const metadata = normalizeMetadata({
    ...(input.metadata ?? {}),
    product: input.product,
    source: input.source ?? input.surface,
    surface: input.surface,
    userId,
    wsId,
  });

  return {
    containerTag,
    customId,
    metadata,
    product: input.product,
    source: input.source,
    surface: input.surface,
    userId,
    wsId,
  };
}

export function buildProductFilter(product: string) {
  return {
    filterType: 'metadata' as const,
    key: 'product',
    value: product,
  };
}

export function buildKeyFilter(key: string) {
  return {
    filterType: 'metadata' as const,
    key: 'memoryKey',
    value: key,
  };
}

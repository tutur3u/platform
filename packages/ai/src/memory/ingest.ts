import { rememberAiMemory } from './operations';
import { resolveAiMemoryScope } from './scope';
import type {
  AiMemoryMetadata,
  AiMemoryProduct,
  AiMemoryResult,
} from './types';

export async function ingestAiMemoryEvent({
  content,
  customId,
  metadata,
  product,
  source,
  surface,
  title,
  userId,
  wsId,
}: {
  content: string;
  customId?: string | null;
  metadata?: AiMemoryMetadata;
  product: AiMemoryProduct;
  source?: string | null;
  surface: string;
  title?: string | null;
  userId?: string | null;
  wsId?: string | null;
}): Promise<AiMemoryResult<{ id: string; status: string } | null>> {
  const value = content.trim();
  if (!value) {
    return { ok: true, reason: 'empty_content', skipped: true, value: null };
  }

  const scope = resolveAiMemoryScope({
    customId,
    metadata,
    product,
    source,
    surface,
    userId,
    wsId,
  });

  return rememberAiMemory({
    category: 'conversation_topic',
    key: title ?? surface,
    scope,
    value,
  });
}

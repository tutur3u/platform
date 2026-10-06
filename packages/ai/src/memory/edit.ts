import {
  createMeteredTextEmbedding,
  shouldDisableMemoryForMeteringReason,
} from '../embeddings/metered';
import { AiMemoryServiceHttpError, getAiMemoryServiceClient } from './client';
import {
  disableAiMemoryForMeteringFailure,
  isAiMemoryEnabledForScope,
} from './settings';
import type {
  AiEditableMemory,
  AiMemoryEditResult,
  AiMemoryScope,
} from './types';

function owned(memory: AiEditableMemory, scope: AiMemoryScope, id: string) {
  return (
    memory?.id === id &&
    memory.status === 'done' &&
    memory.metadata?.userId === scope.userId &&
    memory.metadata?.wsId === scope.wsId &&
    memory.metadata?.product === scope.product &&
    (memory.customId === null || typeof memory.customId === 'string') &&
    typeof memory.content === 'string' &&
    /^v1:[a-f0-9]{32}$/.test(memory.revision)
  );
}

function provenance(memory: AiEditableMemory) {
  return JSON.stringify(
    Object.entries(memory.metadata).sort(([a], [b]) => a.localeCompare(b))
  );
}

function serviceFailure(error: unknown): AiMemoryEditResult {
  const status =
    error instanceof AiMemoryServiceHttpError ? error.status : null;
  return {
    ok: false,
    reason:
      status === 404
        ? 'not_found'
        : status === 409
          ? 'conflict'
          : 'service_failed',
  };
}

export async function readAiMemoryForEdit({
  scope,
  memoryId,
}: {
  scope: AiMemoryScope | null;
  memoryId: string;
}): Promise<AiMemoryEditResult> {
  const client = getAiMemoryServiceClient();
  if (!scope || !memoryId.trim()) return { ok: false, reason: 'invalid_input' };
  if (!client) return { ok: false, reason: 'not_configured' };
  try {
    const { memory } = await client.readEditableMemory({
      id: memoryId,
      containerTag: scope.containerTag,
      userId: scope.userId,
      wsId: scope.wsId,
      product: scope.product,
    });
    return owned(memory, scope, memoryId)
      ? { ok: true, memory }
      : { ok: false, reason: 'not_found' };
  } catch (error) {
    return serviceFailure(error);
  }
}

export async function editAiMemory({
  scope,
  memoryId,
  revision,
  value,
  ignoreSettings = false,
}: {
  scope: AiMemoryScope | null;
  memoryId: string;
  revision: string;
  value: string;
  ignoreSettings?: boolean;
}): Promise<AiMemoryEditResult> {
  if (
    !scope ||
    !memoryId.trim() ||
    !value.trim() ||
    value.length > 20000 ||
    !/^v1:[a-f0-9]{32}$/.test(revision)
  )
    return { ok: false, reason: 'invalid_input' };
  const client = getAiMemoryServiceClient();
  if (!client) return { ok: false, reason: 'not_configured' };
  if (
    !ignoreSettings &&
    !(await isAiMemoryEnabledForScope({
      product: scope.product,
      userId: scope.userId,
      wsId: scope.wsId,
    }))
  )
    return { ok: false, reason: 'disabled' };

  const original = await readAiMemoryForEdit({ scope, memoryId });
  if (!original.ok) return original;
  if (original.memory.revision !== revision)
    return { ok: false, reason: 'conflict' };
  const originalProvenance = provenance(original.memory);
  const originalCustomId = original.memory.customId;
  try {
    const content = value.trim();
    const embedding = await createMeteredTextEmbedding({
      metadata: { operation: 'edit', product: scope.product },
      source: 'ai_memory',
      taskType: 'RETRIEVAL_DOCUMENT',
      userId: scope.userId,
      wsId: scope.wsId,
      value: content,
    });
    if (!embedding.ok) {
      if (shouldDisableMemoryForMeteringReason(embedding)) {
        await disableAiMemoryForMeteringFailure({
          reason: embedding.reason,
          userId: scope.userId,
          wsId: scope.wsId,
        });
      }
      return { ok: false, reason: 'embedding_failed' };
    }
    // A competing edit/delete can win during embedding. The service CAS then
    // rejects our write; the metered embedding may already have used credits.
    const result = await client.updateEditableMemory({
      id: memoryId,
      containerTag: scope.containerTag,
      userId: scope.userId,
      wsId: scope.wsId,
      product: scope.product,
      revision,
      content,
      embedding: embedding.embedding,
    });
    if (
      result.updated !== true ||
      !owned(result.memory, scope, memoryId) ||
      result.memory.content !== content ||
      result.memory.revision === revision ||
      result.memory.customId !== originalCustomId ||
      provenance(result.memory) !== originalProvenance
    )
      return { ok: false, reason: 'service_failed' };
    return { ok: true, memory: result.memory };
  } catch (error) {
    return serviceFailure(error);
  }
}

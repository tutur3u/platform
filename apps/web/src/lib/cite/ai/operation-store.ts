import 'server-only';

import { z } from 'zod';
import { getCitationRuntimeDb } from '../runtime-db';
import {
  CitationAiError,
  type CitationAiOperation,
  type CitationAiOperationStore,
  citationAiOperationSchema,
} from './contracts';
import { boundedCitationOperation } from './timeout';

const operationResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['claimed', 'existing']),
    record: citationAiOperationSchema,
  }),
  z.object({ kind: z.literal('busy') }),
  z.object({ kind: z.literal('expired') }),
  z.object({ kind: z.literal('conflict') }),
]);

function unavailable() {
  return new CitationAiError('AI_UNAVAILABLE', 503);
}

async function rpcResult<T>(
  response: PromiseLike<{ data: unknown; error: unknown }>,
  schema: z.ZodType<T>
): Promise<T> {
  const { data, error } = await boundedCitationOperation(response, 5000).catch(
    () => {
      throw unavailable();
    }
  );
  if (error) throw unavailable();
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

function encode(record: CitationAiOperation) {
  const parsed = citationAiOperationSchema.parse(record);
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 96000)
    throw unavailable();
  return parsed;
}

/** Service-only receipts bind the operation and attempt to the authenticated actor. */
export function createCitationAiOperationStore(
  getDb = getCitationRuntimeDb
): CitationAiOperationStore {
  async function db() {
    try {
      return await boundedCitationOperation(getDb(), 5000);
    } catch {
      throw unavailable();
    }
  }

  return {
    async claim(operationId, binding, retryOnly = false) {
      const client = await db();
      const result = await rpcResult(
        client.rpc('claim_cite_ai_operation', {
          p_operation_id: operationId,
          p_actor_id: binding.userId,
          p_binding: binding,
          p_retry_only: retryOnly,
        }),
        operationResultSchema
      );
      switch (result.kind) {
        case 'busy':
          throw new CitationAiError('GENERATION_IN_PROGRESS', 409);
        case 'expired':
          throw new CitationAiError('OPERATION_EXPIRED', 409);
        case 'conflict':
          throw new CitationAiError('OPERATION_CONFLICT', 409);
        case 'claimed':
          return { claimed: true, record: result.record };
        case 'existing':
          return { claimed: false, record: result.record };
      }
    },
    async transition(operationId, previous, next) {
      const client = await db();
      return rpcResult(
        client.rpc('transition_cite_ai_operation', {
          p_operation_id: operationId,
          p_actor_id: previous.binding.userId,
          p_previous: encode(previous),
          p_next: encode(next),
        }),
        z.boolean()
      );
    },
    async claimDeduction(operationId, record) {
      const client = await db();
      return rpcResult(
        client.rpc('claim_cite_ai_deduction', {
          p_operation_id: operationId,
          p_actor_id: record.binding.userId,
          p_checkpoint: encode(record),
        }),
        z.boolean()
      );
    },
    async read(operationId, userId) {
      const client = await db();
      const result = await rpcResult(
        client.rpc('read_cite_ai_operation', {
          p_operation_id: operationId,
          p_actor_id: userId,
        }),
        operationResultSchema.nullable()
      );
      if (result === null) return null;
      if (result.kind === 'conflict')
        throw new CitationAiError('OPERATION_CONFLICT', 409);
      if (result.kind !== 'existing') throw unavailable();
      if (result.record.binding.userId !== userId)
        throw new CitationAiError('OPERATION_CONFLICT', 409);
      return result.record;
    },
  };
}

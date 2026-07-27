import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import type { Json } from '@tuturuuu/types';
import { embedMany, gateway } from 'ai';
import { z } from 'zod';
import {
  approximateTokenCount,
  captureAiStudioContent,
  prepareMeteredExecution,
  publicApiError,
  settleMeteredExecution,
} from './public-api';

export const embeddingRequestSchema = z.object({
  dimensions: z.number().int().min(1).max(16_384).optional(),
  input: z.union([
    z.string().min(1).max(1_000_000),
    z.array(z.string().min(1).max(1_000_000)).min(1).max(2_048),
  ]),
  model: z.string().min(1),
});

export async function executeEmbeddingRequest(
  request: Request,
  input: z.infer<typeof embeddingRequestSchema>
): Promise<Response> {
  let context: Awaited<ReturnType<typeof prepareMeteredExecution>> | undefined;

  try {
    const values = Array.isArray(input.input) ? input.input : [input.input];
    const estimatedTokens = values.reduce(
      (total, value) => total + approximateTokenCount(value),
      0
    );
    context = await prepareMeteredExecution({
      feature: 'embeddings',
      maxUsage: {
        embeddingUnits: values.length,
        inputTokens: estimatedTokens,
      },
      metadata: {
        dimensions: input.dimensions ?? null,
        input_count: values.length,
      },
      modelId: input.model,
      request,
    });

    const result = await embedMany({
      abortSignal: request.signal,
      model: gateway.embedding(input.model),
      providerOptions: input.dimensions
        ? {
            google: {
              outputDimensionality: input.dimensions,
            },
          }
        : undefined,
      values,
    });
    const inputTokens = result.usage.tokens ?? estimatedTokens;

    await Promise.all([
      settleMeteredExecution(context, {
        status: 'succeeded',
        usage: {
          embeddingUnits: result.embeddings.length,
          inputTokens,
        },
      }),
      captureAiStudioContent(context, {
        output: {
          embedding_count: result.embeddings.length,
          vector_dimensions: result.embeddings[0]?.length ?? 0,
        },
        prompt: { input: values } as Json,
      }),
    ]);

    return Response.json(
      {
        data: result.embeddings.map((embedding, index) => ({
          embedding,
          index,
          object: 'embedding',
        })),
        model: input.model,
        object: 'list',
        usage: {
          prompt_tokens: inputTokens,
          total_tokens: inputTokens,
        },
      },
      {
        headers: {
          'cache-control': 'no-store',
          'x-request-id': context.requestId,
        },
      }
    );
  } catch (error) {
    if (context) {
      await settleMeteredExecution(context, {
        error,
        status: request.signal.aborted ? 'aborted' : 'failed',
        usage: {},
      }).catch(() => undefined);
    }
    return publicApiError(
      error instanceof z.ZodError
        ? new AiStudioError(error.issues[0]?.message ?? 'Invalid request.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error,
      context?.requestId
    );
  }
}

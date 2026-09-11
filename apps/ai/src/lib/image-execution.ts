import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import type { Json } from '@tuturuuu/types';
import { gateway, generateImage } from 'ai';
import { z } from 'zod';
import {
  captureAiStudioContent,
  prepareMeteredExecution,
  publicApiError,
  settleMeteredExecution,
} from './public-api';
import type { MeteredAiCredential } from './public-credential';

export const imageRequestSchema = z.object({
  model: z.string().min(1),
  n: z.number().int().min(1).max(4).default(1),
  prompt: z.string().min(1).max(100_000),
  response_format: z.enum(['b64_json']).default('b64_json'),
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024'),
});

function aspectRatio(size: z.infer<typeof imageRequestSchema>['size']) {
  if (size === '1536x1024') return '3:2' as const;
  if (size === '1024x1536') return '2:3' as const;
  return '1:1' as const;
}

export async function executeImageRequest(
  request: Request,
  input: z.infer<typeof imageRequestSchema>,
  options: {
    credential?: MeteredAiCredential;
    metadata?: Record<string, Json>;
    requirePricedUsage?: boolean;
    feature?: string;
  } = {}
): Promise<Response> {
  let context: Awaited<ReturnType<typeof prepareMeteredExecution>> | undefined;

  try {
    context = await prepareMeteredExecution({
      feature: options.feature ?? 'image_generation',
      credential: options.credential,
      requirePricedUsage: options.requirePricedUsage,
      requiredModelType: 'image',
      maxUsage: { imageUnits: input.n },
      metadata: { ...options.metadata, image_count: input.n, size: input.size },
      modelId: input.model,
      request,
    });
    const generated = await Promise.all(
      Array.from({ length: input.n }, () =>
        generateImage({
          abortSignal: request.signal,
          aspectRatio: aspectRatio(input.size),
          model: gateway.image(input.model),
          prompt: input.prompt,
          maxRetries: 0,
        })
      )
    );

    const [billing] = await Promise.all([
      settleMeteredExecution(context, {
        status: 'succeeded',
        usage: { imageUnits: generated.length },
      }),
      captureAiStudioContent(context, {
        output: { image_count: generated.length, size: input.size },
        prompt: { prompt: input.prompt } as Json,
      }),
    ]);

    return Response.json(
      {
        created: Math.floor(Date.now() / 1_000),
        tuturuuu: { run_id: context.runId, billing },
        data: generated.map(({ image }) => ({
          b64_json: image.base64,
          media_type: image.mediaType,
        })),
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
        : error instanceof Error && error.name === 'GatewayModelNotFoundError'
          ? new AiStudioError('The selected image model is unavailable.', {
              code: 'model_not_found',
              status: 404,
            })
          : error,
      context?.requestId
    );
  }
}

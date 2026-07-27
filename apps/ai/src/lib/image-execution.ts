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
  input: z.infer<typeof imageRequestSchema>
): Promise<Response> {
  let context: Awaited<ReturnType<typeof prepareMeteredExecution>> | undefined;

  try {
    context = await prepareMeteredExecution({
      feature: 'image_generation',
      maxUsage: { imageUnits: input.n },
      metadata: { image_count: input.n, size: input.size },
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
        })
      )
    );

    await Promise.all([
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
        data: generated.map(({ image }) => ({
          b64_json: image.base64,
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
        : error,
      context?.requestId
    );
  }
}

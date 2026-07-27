import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import type { Json } from '@tuturuuu/types';
import { gateway, generateText, streamText } from 'ai';
import { z } from 'zod';
import {
  approximateTokenCount,
  captureAiStudioContent,
  prepareMeteredExecution,
  publicApiError,
  settleMeteredExecution,
} from './public-api';

export const textRequestSchema = z.object({
  instructions: z.string().max(100_000).optional(),
  max_output_tokens: z.number().int().min(1).max(32_768).default(2_048),
  model: z.string().min(1),
  prompt: z.string().min(1).max(1_000_000),
  stream: z.boolean().default(false),
});

type TextRequest = z.infer<typeof textRequestSchema>;

function commonHeaders(requestId: string) {
  return {
    'cache-control': 'no-store',
    'x-request-id': requestId,
  };
}

export async function executeTextRequest(
  request: Request,
  input: TextRequest,
  {
    feature,
    responseShape,
  }: {
    feature: string;
    responseShape: 'chat' | 'responses';
  }
): Promise<Response> {
  let context: Awaited<ReturnType<typeof prepareMeteredExecution>> | undefined;

  try {
    context = await prepareMeteredExecution({
      feature,
      maxUsage: {
        inputTokens:
          approximateTokenCount(input.prompt) +
          approximateTokenCount(input.instructions),
        outputTokens: input.max_output_tokens,
      },
      metadata: {
        response_shape: responseShape,
        streaming: input.stream,
      },
      modelId: input.model,
      request,
    });

    const model = gateway(input.model);
    const common = {
      abortSignal: request.signal,
      maxOutputTokens: input.max_output_tokens,
      model,
      prompt: input.prompt,
      system: input.instructions,
    };

    if (!input.stream) {
      const result = await generateText(common);
      const usage = {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
      };

      await Promise.all([
        settleMeteredExecution(context, {
          metadata: { finish_reason: String(result.finishReason) },
          status: 'succeeded',
          usage,
        }),
        captureAiStudioContent(context, {
          output: { text: result.text },
          prompt: {
            instructions: input.instructions,
            prompt: input.prompt,
          } as Json,
        }),
      ]);

      const created = Math.floor(Date.now() / 1000);
      const body =
        responseShape === 'chat'
          ? {
              choices: [
                {
                  finish_reason: String(result.finishReason),
                  index: 0,
                  message: { content: result.text, role: 'assistant' },
                },
              ],
              created,
              id: context.requestId,
              model: input.model,
              object: 'chat.completion',
              usage: {
                completion_tokens: usage.outputTokens,
                prompt_tokens: usage.inputTokens,
                total_tokens: usage.inputTokens + usage.outputTokens,
              },
            }
          : {
              created_at: created,
              id: context.requestId,
              model: input.model,
              object: 'response',
              output: [
                {
                  content: [{ text: result.text, type: 'output_text' }],
                  id: `${context.requestId}_message`,
                  role: 'assistant',
                  type: 'message',
                },
              ],
              output_text: result.text,
              status: 'completed',
              usage: {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                total_tokens: usage.inputTokens + usage.outputTokens,
              },
            };

      return Response.json(body, { headers: commonHeaders(context.requestId) });
    }

    const firstTokenStartedAt = Date.now();
    let firstTokenLatencyMs: number | null = null;
    let outputText = '';
    const result = streamText({
      ...common,
      onFinish: async ({ finishReason, text, usage }) => {
        outputText = text;
        await Promise.all([
          settleMeteredExecution(context!, {
            firstTokenLatencyMs,
            metadata: { finish_reason: String(finishReason) },
            status: request.signal.aborted ? 'aborted' : 'succeeded',
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
            },
          }),
          captureAiStudioContent(context!, {
            output: { text },
            prompt: {
              instructions: input.instructions,
              prompt: input.prompt,
            } as Json,
          }),
        ]);
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const text of result.textStream) {
            if (firstTokenLatencyMs === null) {
              firstTokenLatencyMs = Date.now() - firstTokenStartedAt;
            }
            outputText += text;
            const chunk =
              responseShape === 'chat'
                ? {
                    choices: [{ delta: { content: text }, index: 0 }],
                    created: Math.floor(Date.now() / 1000),
                    id: context!.requestId,
                    model: input.model,
                    object: 'chat.completion.chunk',
                  }
                : {
                    delta: text,
                    response_id: context!.requestId,
                    type: 'response.output_text.delta',
                  };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          await settleMeteredExecution(context!, {
            error,
            firstTokenLatencyMs,
            status: request.signal.aborted ? 'aborted' : 'failed',
            usage: {
              outputTokens: approximateTokenCount(outputText),
            },
          }).catch(() => undefined);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...commonHeaders(context.requestId),
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
      },
    });
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
